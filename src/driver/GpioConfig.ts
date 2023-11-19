import { spawnSync } from 'child_process'

type GpioConfig = {
  interrupt: number
  fault: number
  status: number
  mostStatus: number
  reset: number
}

export const getPiGpioConfig = (): GpioConfig => {
  const piCheckResult = spawnSync('cat', [
    '/sys/firmware/devicetree/base/model',
  ])
  const isPi5 = piCheckResult.stdout.toString().includes('Pi 5')
  return isPi5
    ? {
        interrupt: 404,
        fault: 405,
        status: 415,
        mostStatus: 425,
        reset: 416,
      }
    : { interrupt: 5, fault: 6, status: 16, mostStatus: 25, reset: 17 }
}
