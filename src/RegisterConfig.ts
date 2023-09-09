import { Registers as reg } from "./Registers"
import { type Config } from "./OS8104A"

export function getRegisterConfig(
    { nodeAddressLow, nodeAddressHigh, groupAddress }: Config,
    mode: number
): Map<number, number> {
    console.log(nodeAddressLow, nodeAddressHigh, groupAddress)
    const config = new Map()

    // Testing for 44.1khz, this is untested and just configured as per datasheet, if running at 44.1khz then the crystal is not compatible, so the chip has to be started up in legacy mode
    // and the locking source needs to be set to the RX network.
    const lockingSource: reg.bCM1_PLL_INPUT_CRYSTAL | reg.bCM1_PLL_INPUT_MOST =
        mode === 1 ? reg.bCM1_PLL_INPUT_CRYSTAL : reg.bCM1_PLL_INPUT_MOST
    const crystalDivider: reg.bCM1_CRYSTAL_DIVIDER_384F | reg.bCM1_CRYSTAL_DIVIDER_256F =
        mode === 1 ? reg.bCM1_CRYSTAL_DIVIDER_384F : reg.bCM1_CRYSTAL_DIVIDER_256F
    const bypass: reg.bXCR_ENHANCED_BYPASS | reg.bXCR_LEGACY_BYPASS =
        mode === 1 ? reg.bXCR_ENHANCED_BYPASS : reg.bXCR_LEGACY_BYPASS

    // SCK as output
    // config.set(reg.REG_bSDC1, reg.bSDC1_SCK_OUTPUT)

    // //Clear power on int
    // config.set(reg.REG_bMSGC, reg.bMSGC_RESET_ERR_INT)

    // Node address high
    config.set(reg.REG_bNAH, nodeAddressHigh)

    // Node address low
    config.set(reg.REG_bNAL, nodeAddressLow)

    // Group address
    config.set(reg.REG_bGA, groupAddress)

    // Clock Manager
    config.set(reg.REG_bCM1, reg.bCM1_PLL_ENABLE | lockingSource | crystalDivider)

    if (mode === 0) {
        config.set(reg.REG_bSDC3, reg.bSDC3_MUTE_SOURCE_PORTS | reg.bSDC3_SOURCE_PORT_DIS)
    }
    if (mode === 0) {
        config.set(
            reg.REG_bCM3,
            reg.bCM3_FREN_DIS |
                reg.bCM3_AUTO_CRYSTAL_DIS |
                reg.bCM3_DIS_AUTO_SWITCH_CLOCK |
                reg.bCM3_FREQ_REG_RESET
        )
    }

    // Transmitter control
    config.set(
        reg.REG_bXCR,
        reg.bXCR_SLAVE |
            reg.bXCR_OUTPUT_ENABLE |
            bypass |
            reg.bXCR_ALL_BYPASS_DIS |
            reg.bXCR_REN_DIS
    )

    // Source Data control
    config.set(
        reg.REG_bSDC1,
        reg.bSDC1_ACTIVE_EDGE_EN |
            reg.bSDC1_DELAY_FIRST_BIT_EN |
            reg.bSDC1_POLARITY_FSY_FALLING |
            reg.bSDC1_NO_CYCLES_DEF |
            reg.bSDC1_SCK_OUTPUT |
            reg.bSDC1_TRANSPARENT_DIS |
            reg.bSDC1_UNMUTE_SOURCE |
            reg.bSDC1_SPDIF_DIS
    )

    // set sck rate
    config.set(reg.REG_bSDC2, reg.bSDC2_SCK_32F)

    // Transceiver Status
    config.set(
        reg.REG_bXSR,
        reg.bXSR_CODING_ERR_MASK | reg.bXSR_SPDIF_ERR_MASK | reg.bXSR_LOCK_ERR_MASK
    )

    // Interrupt Enable
    config.set(reg.REG_bIE, reg.bIE_RX_INT_EN | reg.bIE_ERR_INT_EN | reg.bIE_TX_INT_EN)

    // reset interrupts
    config.set(
        reg.REG_bMSGC,
        reg.bMSGC_RESET_MESSAGE_RX_INT |
            reg.bMSGC_RESET_MESSAGE_TX_INT |
            reg.bMSGC_RESET_ERR_INT |
            reg.bMSGC_RESET_NET_CONF_CHANGE
    )

    return config
}
