import { dpsTopics } from '#simulator/dpsTopics.js'
import { DeviceRegistrationState } from 'azure-iot-provisioning-service/dist/interfaces'
import { connect } from 'mqtt'
import os from 'node:os'
import { URLSearchParams } from 'url'
import { v4 } from 'uuid'

export const provision = async ({
	deviceId,
	privateKey,
	certificate,
	intermediateCA,
	digicertRoot,
	baltimoreRoot,
	idScope,
	log,
}: {
	deviceId: string
	/**
	 * The device's private key
	 */
	privateKey: Buffer
	/**
	 * The device certificate
	 */
	certificate: Buffer
	/**
	 * The intermediate CA certificate
	 */
	intermediateCA: Buffer
	/**
	 * The root CA certificate
	 */
	rootCA: Buffer
	/**
	 * The Digicert G5 root certificate
	 */
	digicertRoot: Buffer
	/**
	 * The Baltimore root certificate
	 */
	baltimoreRoot: Buffer
	idScope: string
	log?: (...args: any[]) => void
}): Promise<DeviceRegistrationState> => {
	// Connect to Device Provisioning Service using MQTT
	// @see https://docs.microsoft.com/en-us/azure/iot-dps/iot-dps-mqtt-support

	const host = 'global.azure-devices-provisioning.net'

	log?.('[DPS]', `Connecting to`, host)
	log?.('[DPS]', `ID scope`, idScope)

	const client = connect({
		host,
		port: 8883,
		rejectUnauthorized: true,
		clientId: deviceId,
		username: `${idScope}/registrations/${deviceId}/api-version=2019-03-31`,
		protocol: 'mqtts',
		protocolVersion: 4,
		key: privateKey,
		cert: [certificate, intermediateCA].join(os.EOL),
		ca: [digicertRoot, baltimoreRoot].join(os.EOL),
	})

	// To register a device through DPS, a device should subscribe using $dps/registrations/res/# as a Topic Filter. The multi-level wildcard # in the Topic Filter is used only to allow the device to receive additional properties in the topic name. DPS does not allow the usage of the # or ? wildcards for filtering of subtopics. Since DPS is not a general-purpose pub-sub messaging broker, it only supports the documented topic names and topic filters.
	client.subscribe(dpsTopics.registrationResponses)

	client.on('connect', () => {
		log?.('[DPS]', 'Connected', deviceId)

		// The device should publish a register message to DPS using $dps/registrations/PUT/iotdps-register/?$rid={request_id} as a Topic Name. The payload should contain the Device Registration object in JSON format. In a successful scenario, the device will receive a response on the $dps/registrations/res/202/?$rid={request_id}&retry-after=x topic name where x is the retry-after value in seconds. The payload of the response will contain the RegistrationOperationStatus object in JSON format.
		client.publish(
			dpsTopics.register(v4()),
			JSON.stringify({
				registrationId: deviceId,
			}),
		)
	})

	// The device must poll the service periodically to receive the result of the device registration operation.
	const registration = await new Promise<DeviceRegistrationState>(
		(resolve, reject) => {
			client.on('message', (topic, payload) => {
				const message = JSON.parse(payload.toString())
				if (topic.startsWith(dpsTopics.registrationResult(202))) {
					const args = new URLSearchParams(topic.split('?')[1])
					const { operationId, status } = message
					log?.('[DPS]', 'Status', status)
					log?.('[DPS]', 'Retry after', args.get('retry-after' as string))
					setTimeout(() => {
						// Assuming that the device has already subscribed to the $dps/registrations/res/# topic as indicated above, it can publish a get operationstatus message to the $dps/registrations/GET/iotdps-get-operationstatus/?$rid={request_id}&operationId={operationId} topic name. The operation ID in this message should be the value received in the RegistrationOperationStatus response message in the previous step.
						client.publish(dpsTopics.registationStatus(v4(), operationId), '')
					}, parseInt(args.get('retry-after') ?? '1', 10) * 1000)
					return
				}
				// In the successful case, the service will respond on the $dps/registrations/res/200/?$rid={request_id} topic. The payload of the response will contain the RegistrationOperationStatus object. The device should keep polling the service if the response code is 202 after a delay equal to the retry-after period. The device registration operation is successful if the service returns a 200 status code.
				if (topic.startsWith(dpsTopics.registrationResult(200))) {
					const { status, registrationState } = message
					log?.('[DPS]', 'Status', status)
					log?.('[DPS]', 'IoT Hub', registrationState.assignedHub)
					resolve(registrationState)
				}
				// Invalid certificates
				if (topic.startsWith(dpsTopics.registrationResult(401))) {
					log?.('[DPS]', 'Forbidden', JSON.stringify(message))
					return reject(new Error(`Connection forbidden: ${message.message}`))
				}
				log?.('[DPS]', 'Unexpected message', JSON.stringify(message))
				return reject(new Error(`Unexpected message on topic ${topic}!`))
			})
			client.on('error', (error) => {
				log?.('[DPS]', 'Error', JSON.stringify(error))
				reject(error)
			})
		},
	)

	client.end()
	client.removeAllListeners()
	log?.(
		'[DPS]',
		`Device registration succeeded with IotHub`,
		registration.assignedHub,
	)
	return registration
}
