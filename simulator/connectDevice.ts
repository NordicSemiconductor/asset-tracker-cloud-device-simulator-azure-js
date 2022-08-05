import { provision } from '#simulator/provision.js'
import { DeviceRegistrationState } from 'azure-iot-provisioning-service/dist/interfaces'
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
	privateKey: Buffer
	clientCert: Buffer
	caCert: Buffer
	registration?: DeviceRegistrationState
	idScope: string
	log?: (...args: any[]) => void
	modelId?: string
}): Promise<{
	client: MqttClient
	registration: DeviceRegistrationState
}> => {
	const acutalRegistration: DeviceRegistrationState =
		registration ??
		(await provision({
			caCert,
			clientCert,
			deviceId,
			idScope,
			privateKey,
			log,
		}))
	const host = acutalRegistration.assignedHub
	return new Promise((resolve, reject) => {
		try {
			log?.(`Connecting to`, host)
			const username = `${host}/${deviceId}/?api-version=2020-09-30&model-id=${
				modelId ?? 'dtmi:azure:DeviceManagement:DeviceInformation;1'
			}`
			const client = connect({
				host,
				port: 8883,
				key: privateKey,
				cert: clientCert,
				rejectUnauthorized: true,
				clientId: deviceId,
				protocol: 'mqtts',
				username,
				protocolVersion: 4,
			})
			client.on('connect', async () => {
				log?.('Connected', deviceId)
				log?.(
					'ModelId',
					modelId ?? 'dtmi:azure:DeviceManagement:DeviceInformation;1',
				)
				resolve({
					client,
					registration: acutalRegistration,
				})
			})
		} catch (err) {
			reject(err)
		}
	})
}
