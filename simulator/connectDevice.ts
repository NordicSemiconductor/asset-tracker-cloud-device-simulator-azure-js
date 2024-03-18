import { provision } from '#simulator/provision.js'
import { DeviceRegistrationState } from 'azure-iot-provisioning-service/dist/interfaces.js'
import { connect, MqttClient } from 'mqtt'

/**
 * Connect the device to the Azure IoT Hub.
 * If this device is not yet registered, connect to the Device Provisioning Service (DPS) to acquire the assigned IoT Hub hostname.
 */
export const connectDevice = async ({
	deviceId,
	privateKey,
	clientCert,
	caCert,
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
	 * The device's certificate
	 */
	clientCert: Buffer
	/**
	 * The CA certificate
	 */
	caCert: Buffer
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
				ca: caCert,
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
