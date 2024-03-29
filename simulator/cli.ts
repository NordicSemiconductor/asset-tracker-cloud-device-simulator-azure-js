import { simulator } from '#simulator/simulator.js'
import chalk from 'chalk'

const die = (err: Error) => {
	console.error(chalk.red(`An unhandled exception occurred!`))
	console.error(chalk.red(err.message))
	console.error(err)
	process.exit(1)
}

process.on('uncaughtException', die)
process.on('unhandledRejection', die)

simulator().catch(die)
