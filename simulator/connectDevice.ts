import { provision } from '#simulator/provision.js'
import { DeviceRegistrationState } from 'azure-iot-provisioning-service/dist/interfaces'
import { connect, MqttClient } from 'mqtt'
import os from 'node:os'

/**
 * Connect the device to the Azure IoT Hub.
 * If this device is not yet registered, connect to the Device Provisioning Service (DPS) to acquire the assigned IoT Hub hostname.
 */
export const connectDevice = async ({
	deviceId,
	privateKey,
	clientCert,
	caCert,
	digicertRoot,
	baltimoreRoot,
	idScope,
	log,
	registration,
	modelId,
}: {
	deviceId: string
	/**
	 * The device's private key
	 */
	privateKey: Buffer
	/**
	 * The device's client certificate
	 */
	clientCert: Buffer
	/**
	 * The CA certificate registered in the IoT Hub Device Provisioning instance.
	 * This is referred to as the "root" certificate.
	 * It is not the "intermediate" certificate.
	 */
	caCert: Buffer
	/**
	 * The Digicert G5 root certificate
	 */
	digicertRoot: Buffer
	/**
	 * The Baltimore root certificate
	 */
	baltimoreRoot: Buffer
	registration?: DeviceRegistrationState
	idScope: string
	log?: (...args: any[]) => void
	modelId?: string
}): Promise<{
	client: MqttClient
	registration: DeviceRegistrationState
}> => {
	const actualRegistration: DeviceRegistrationState =
		registration ??
		(await provision({
			deviceId,
			privateKey,
			clientCert,
			caCert,
			digicertRoot,
			baltimoreRoot,
			idScope,
			log,
		}))
	const host = actualRegistration.assignedHub
	return new Promise((resolve, reject) => {
		try {
			log?.(`Connecting to`, host)
			const username = `${host}/${deviceId}/?api-version=2020-09-30&model-id=${
				modelId ?? 'dtmi:azure:DeviceManagement:DeviceInformation;1'
			}`
			const client = connect({
				host,
				port: 8883,
				rejectUnauthorized: true,
				clientId: deviceId,
				protocol: 'mqtts',
				username,
				protocolVersion: 4,
				key: privateKey,
				cert: clientCert,
				ca: [caCert, digicertRoot, baltimoreRoot].join(os.EOL),
			})
			client.on('connect', async () => {
				log?.('Connected', deviceId)
				log?.(
					'ModelId',
					modelId ?? 'dtmi:azure:DeviceManagement:DeviceInformation;1',
				)
				resolve({
					client,
					registration: actualRegistration,
				})
			})
		} catch (err) {
			reject(err)
		}
	})
}
