import { connectDevice } from '#simulator/connectDevice.js'
import { defaultConfig } from '#simulator/defaultConfig.js'
import { deviceTopics } from '#simulator/deviceTopics.js'
import { Status } from '#simulator/fota.js'
import {
	uiServer,
	WebSocketConnection,
} from '@nordicsemiconductor/asset-tracker-cloud-device-ui-server'
import { DeviceRegistrationState } from 'azure-iot-provisioning-service/dist/interfaces'
import chalk from 'chalk'
import * as fs from 'fs'
import * as os from 'os'
import { v4 } from 'uuid'

const cellId = process.env.CELL_ID

export const simulator = async (): Promise<void> => {
	const certJSON = process.argv[process.argv.length - 1]
	let privateKey: string,
		clientCert: string,
		caCert: string,
		deviceId: string,
		registration: DeviceRegistrationState | undefined,
		idScope: string,
		c: any
	try {
		c = JSON.parse(fs.readFileSync(certJSON, 'utf-8')) as {
			idScope: string
			clientId: string
			privateKey: string
			clientCert: string
			caCert: string
		}
		privateKey = c.privateKey
		clientCert = c.clientCert
		caCert = c.caCert
		deviceId = c.clientId
		registration = c.registration
		idScope = c.idScope
	} catch {
		throw new Error(`Failed to parse the certificate JSON using ${certJSON}!`)
	}

	const { client, registration: actualRegistration } = await connectDevice({
		modelId: 'dtmi:AzureDeviceUpdate;1',
		privateKey: Buffer.from(privateKey),
		clientCert: Buffer.from(clientCert),
		caCert: Buffer.from(caCert),
		deviceId,
		registration,
		idScope,
		log: (info, context, ...rest) =>
			console.log(
				chalk.magenta(`${info}:`),
				chalk.yellow(context),
				...rest.map((s) => chalk.gray(s)),
			),
	})

	// Write registration information
	if (actualRegistration !== registration) {
		fs.writeFileSync(
			certJSON,
			JSON.stringify(
				{
					...c,
					registration: actualRegistration,
				},
				null,
				2,
			),
			'utf-8',
		)
		console.log(
			chalk.green(`Registration information written to`),
			chalk.blue(certJSON),
		)
		console.log(chalk.magenta('Registration information:'))
		console.log(chalk.yellow(JSON.stringify(actualRegistration, null, 2)))
	}

	const version = '1.0.0'

	const devRoam = {
		dev: {
			v: {
				modV: 'device-simulator',
				brdV: 'device-simulator',
				iccid: '12345678901234567890',
				imei: '352656106111232',
			},
			ts: Date.now(),
		},
		roam: {
			v: {
				band: 666,
				nw: 'LAN',
				rsrp: -70,
				area: 30401,
				mccmnc: 24201,
				cell: cellId === undefined ? 16964098 : parseInt(cellId, 10),
				ip: '0.0.0.0',
			},
			ts: Date.now(),
		},
		firmware: {
			status: 'current',
			currentFwVersion: version,
			pendingFwVersion: '',
		},
	} as const

	const manufacturer = 'Nordic-Semiconductor-ASA'
	const model = 'Device-Simulator'

	const modelData = {
		// See https://github.com/Azure/iot-plugandplay-models/blob/main/dtmi/azure/devicemanagement/deviceinformation-1.json
		deviceInformation: {
			__t: 'c',
			manufacturer,
			model,
			swVersion: version,
			osName: os.type(),
			processorManufacturer: os.arch(),
			totalStorage: 0,
			totalMemory: os.totalmem() / 1024,
		},
		// See https://docs.microsoft.com/en-us/azure/iot-hub-device-update/device-update-plug-and-play
		azureDeviceUpdateAgent: {
			__t: 'c',
			client: {
				resultCode: 200,
				state: 0, // Idle
				deviceProperties: {
					manufacturer,
					model,
				},
				installedUpdateId: null,
			},
		},
	} as const

	let cfg = {
		...defaultConfig,
	}

	let wsConnection: WebSocketConnection
	const wsNotify = (message: Record<string, any>) => {
		if (wsConnection !== undefined) {
			console.log(chalk.magenta('[ws>'), JSON.stringify(message))
			wsConnection.send(JSON.stringify(message))
		} else {
			console.warn(chalk.red('Websocket not connected.'))
		}
	}

	const sendConfigToUi = () => {
		if (wsConnection !== undefined) {
			console.log(chalk.magenta('[ws>'), JSON.stringify(cfg))
			wsNotify({ config: cfg })
		}
	}

	const updateTwinReported = (update: { [key: string]: any }) => {
		console.log(chalk.magenta('>'), chalk.cyan(JSON.stringify(update)))
		client.publish(
			deviceTopics.updateTwinReported(v4()),
			JSON.stringify(update),
		)
	}

	const updateConfig = (updateConfig: { [key: string]: any }) => {
		cfg = {
			...cfg,
			...updateConfig,
		}
		console.log(chalk.blue('Config:'))
		console.log(cfg)
		updateTwinReported({ cfg, ...devRoam, ...modelData })
		sendConfigToUi()
	}

	const messageHandler = (topic: string) => (message: string, path: string) => {
		console.log(chalk.magenta('[ws<'), JSON.stringify({ message, path }))
		console.log(
			chalk.magenta('<'),
			chalk.blue.blueBright(topic),
			chalk.cyan(message),
		)
		client.publish(topic, message)
	}

	/**
	 * Simulate the FOTA process
	 * @see https://docs.microsoft.com/en-us/azure/iot-hub/tutorial-firmware-update#update-the-firmware
	 */
	const simulateFota = ({ fwVersion }: { fwVersion: string }) => {
		updateTwinReported({
			firmware: {
				currentFwVersion: version,
				pendingFwVersion: fwVersion,
				status: Status.DOWNLOADING,
			},
		})
		setTimeout(() => {
			updateTwinReported({
				firmware: {
					currentFwVersion: fwVersion,
					pendingFwVersion: fwVersion,
					status: Status.CURRENT,
				},
			})
		}, 10 * 1000)
	}

	/**
	 * Simulate Azure Device Update
	 * @see https://docs.microsoft.com/en-us/azure/iot-hub-device-update/device-update-plug-and-play
	 * @see https://github.com/Azure/iot-hub-device-update/blob/7a6e4c12d54df7a92984e935c3050f35e359a342/src/agent/adu_core_interface/src/agent_workflow.c
	 *
	 *                    ┌───┐                                     ┌──────┐
	 *                    │CBO│                                     │Client│
	 *                    └─┬─┘                                     └──┬───┘
	 *                      │          UpdateAction: Download          │
	 *                      │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>
	 *                      │                                          │
	 *                      │                                          │────┐
	 *                      │                                          │    │ DownloadStarted (Internal Client State)
	 *                      │                                          │<───┘
	 *                      │                                          │
	 *                      │                                          │────┐
	 *                      │                                          │    │ Download content
	 *                      │                                          │<───┘
	 *                      │                                          │
	 *                      │                                          │
	 *          ╔══════╤════╪══════════════════════════════════════════╪═════════════╗
	 *          ║ ALT  │  Successful Download                          │             ║
	 *          ╟──────┘    │                                          │             ║
	 *          ║           │      UpdateState: DownloadSucceeded      │             ║
	 *          ║           │<──────────────────────────────────────────             ║
	 *          ╠═══════════╪══════════════════════════════════════════╪═════════════╣
	 *          ║ [Failed Download]                                    │             ║
	 *          ║           │           UpdateState: Failed            │             ║
	 *          ║           │<──────────────────────────────────────────             ║
	 *          ║           │                                          │             ║
	 *          ║           │           UpdateAction: Cancel           │             ║
	 *          ║           │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>             ║
	 *          ║           │                                          │             ║
	 *          ║           │            UpdateState: Idle             │             ║
	 *          ║           │<──────────────────────────────────────────             ║
	 *          ╠═══════════╪══════════════════════════════════════════╪═════════════╣
	 *          ║ [Cancel received during "Download content"]          │             ║
	 *          ║           │            UpdateState: Idle             │             ║
	 *          ║           │<──────────────────────────────────────────             ║
	 *          ╚═══════════╪══════════════════════════════════════════╪═════════════╝
	 *                      │                                          │
	 *                      │          UpdateAction: Install           │
	 *                      │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>
	 *                      │                                          │
	 *                      │                                          │────┐
	 *                      │                                          │    │ InstallStarted (Internal Client State)
	 *                      │                                          │<───┘
	 *                      │                                          │
	 *                      │                                          │────┐
	 *                      │                                          │    │ Install content
	 *                      │                                          │<───┘
	 *                      │                                          │
	 *                      │UpdateState: InstallSucceeded (on success)│
	 *                      │<──────────────────────────────────────────
	 *                      │                                          │
	 *                      │           UpdateAction: Apply            │
	 *                      │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>
	 *                      │                                          │
	 *                      │                                          │────┐
	 *                      │                                          │    │ ApplyStarted (Internal Client State)
	 *                      │                                          │<───┘
	 *                      │                                          │
	 *                      │                                          │────┐
	 *                      │                                          │    │ Apply content
	 *                      │                                          │<───┘
	 *                      │                                          │
	 *                      │      UpdateState: Idle (on success)      │
	 *                      │<──────────────────────────────────────────
	 *                    ┌─┴─┐                                     ┌──┴───┐
	 *                    │CBO│                                     │Client│
	 *                    └───┘                                     └──────┘
	 *
	 */
	const simulateADU = (desired: Record<string, any>) => {
		if (desired.azureDeviceUpdateAgent?.service?.action === 0) {
			// Download
			// Download requests
			// console.log('ADU service', desired.azureDeviceUpdateAgent.service)
			console.log(chalk.blue('ADU'), chalk.blueBright(`Downloading Update`))
			Object.values(desired.azureDeviceUpdateAgent?.service?.fileUrls).forEach(
				(url) => {
					console.log('-', chalk.yellow(url))
				},
			)
			updateTwinReported({
				azureDeviceUpdateAgent: {
					client: {
						state: 2, // DownloadSucceeded
					},
				},
			})
		} else if (desired.azureDeviceUpdateAgent?.service?.action === 1) {
			// Install
			// console.log('ADU service', desired.azureDeviceUpdateAgent.service)
			console.log(chalk.blue('ADU'), chalk.blueBright(`Installing Update`))
			updateTwinReported({
				azureDeviceUpdateAgent: {
					client: {
						state: 4, // InstallSucceeded
						installedUpdateId: JSON.stringify(
							JSON.parse(
								desired.azureDeviceUpdateAgent?.service?.updateManifest,
							).updateId,
						),
					},
				},
			})
		} else if (desired.azureDeviceUpdateAgent?.service?.action === 2) {
			// Apply (and reboot)
			// console.log('ADU service', desired.azureDeviceUpdateAgent.service)
			console.log(chalk.blue('ADU'), chalk.blueBright(`Apply Update`))
			updateTwinReported({
				deviceInformation: {
					swVersion: JSON.parse(
						desired.azureDeviceUpdateAgent?.service?.updateManifest,
					).installedCriteria,
				},
				azureDeviceUpdateAgent: {
					client: {
						state: 0, // Idle
					},
				},
			})
		} else if (desired.azureDeviceUpdateAgent?.service?.action === 255) {
			// Abort
			// console.log('ADU service', desired.azureDeviceUpdateAgent.service)
			console.log(chalk.blue('ADU'), chalk.blueBright(`Aborting Update`))
			updateTwinReported({
				azureDeviceUpdateAgent: {
					client: {
						state: 0, // Idle
						installedUpdateId: null,
					},
				},
			})
		}
	}

	// See https://docs.microsoft.com/en-us/azure/iot-hub/iot-hub-mqtt-support#update-device-twins-reported-properties
	// A device must first subscribe to the $iothub/twin/res/# topic to receive the operation's responses from IoT Hub.
	client.subscribe(deviceTopics.twinResponses)
	// Receive desired properties update notifications
	// See https://docs.microsoft.com/en-us/azure/iot-hub/iot-hub-mqtt-support#receiving-desired-properties-update-notifications
	client.subscribe(deviceTopics.desiredUpdate.name)

	// A-GPS and P-GPS
	client.subscribe(`${deviceId}/pgps`)
	client.subscribe(`${deviceId}/agps`)

	const getTwinPropertiesRequestId = v4()

	console.log(chalk.green('Connected:'), chalk.blueBright(deviceId))

	const port = await uiServer({
		deviceId: deviceId,
		onUpdate: updateTwinReported,
		onSensorMessage: (message) => {
			console.log(
				chalk.magenta('>'),
				chalk.yellow(deviceTopics.messages(deviceId)),
			)
			console.log(chalk.magenta('>'), chalk.cyan(JSON.stringify(message)))
			client.publish(deviceTopics.messages(deviceId), JSON.stringify(message))
		},
		onBatch: (update) => {
			console.log(
				chalk.magenta('>'),
				chalk.yellow(deviceTopics.batch(deviceId)),
			)
			console.log(chalk.magenta('>'), chalk.cyan(JSON.stringify(update)))
			client.publish(deviceTopics.batch(deviceId), JSON.stringify(update))
		},
		onWsConnection: (c) => {
			console.log(chalk.magenta('[ws]'), chalk.cyan('connected'))
			wsConnection = c
			sendConfigToUi()
		},
		onMessage: {
			'/pgps/get': messageHandler(
				deviceTopics.messages(deviceId, { pgps: 'get' }),
			),
			'/agps/get': messageHandler(
				deviceTopics.messages(deviceId, { agps: 'get' }),
			),
			'/ncellmeas': messageHandler(
				deviceTopics.messages(deviceId, { ncellmeas: null }),
			),
		},
	})

	console.log()
	console.log(
		'',
		chalk.yellowBright(
			`To control this device use this endpoint in the device simulator UI:`,
		),
		chalk.blueBright(`http://localhost:${port}`),
	)
	console.log()

	const getTwinPropertiesTopic = deviceTopics.getTwinProperties(
		getTwinPropertiesRequestId,
	)
	console.log(chalk.magenta('<'), chalk.yellow(getTwinPropertiesTopic))
	client.publish(getTwinPropertiesTopic, '')

	client.on('message', (topic, payload) => {
		console.log(chalk.magenta('>'), chalk.yellow(topic))
		if (payload.length) {
			console.log(chalk.magenta('>'), chalk.cyan(payload.toString()))
		}
		// Handle update reported messages
		if (
			topic ===
			deviceTopics.twinResponse({
				rid: getTwinPropertiesRequestId,
				status: 200,
			})
		) {
			const p = JSON.parse(payload.toString())
			updateConfig(p.desired.cfg)
			simulateADU(p.desired)
			return
		}
		if (deviceTopics.updateTwinReportedAccepted.test(topic)) {
			// pass
			return
		}
		// Handle desired updates
		if (deviceTopics.desiredUpdate.test(topic)) {
			const desiredUpdate = JSON.parse(payload.toString())
			if (desiredUpdate.cfg !== undefined) {
				updateConfig(desiredUpdate.cfg)
			}
			if (desiredUpdate.firmware !== undefined) {
				simulateFota(desiredUpdate.firmware)
			}
			simulateADU(desiredUpdate)
			return
		}

		wsNotify({ message: { topic, payload: payload.toString() } })
	})

	client.on('error', (err) => {
		console.error(chalk.red(err.message))
	})
}
