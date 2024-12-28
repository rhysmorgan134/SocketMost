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
        interrupt: 576,
        fault: 577,
        status: 587,
        mostStatus: 597,
        reset: 588,
      }
    : { interrupt: 5, fault: 6, status: 16, mostStatus: 26, reset: 17 }
}
