const reg = require('./registers')

module.exports.getConfig = function(freq, nodeAddressLow, nodeAddressHigh, groupAddress) {
    const config = new Map()

    //Testing for 44.1khz, this is untested and just configured as per datasheet, if running at 44.1khz then the crystal is not compatible, so the chip has to be started up in legacy mode
    //and the locking source needs to be set to the RX network.
    let lockingSource = freq===48 ? reg.bCM1_PLL_INPUT_CRYSTAL : reg.bCM1_PLL_INPUT_CRYSTAL
    let crystalDivider = freq===48 ? reg.bCM1_CRYSTAL_DIVIDER_384F : reg.bCM1_CRYSTAL_DIVIDER_256F
    let bypass = freq===48 ? reg.bXCR_ENHANCED_BYPASS : reg.bXCR_LEGACY_BYPASS

    //SCK as output
    config.set(reg.REG_bSDC1, reg.bSDC1_SCK_OUTPUT)

    //Clear power on int
    config.set(reg.REG_bMSGC, reg.bMSGC_RESET_ERR_INT)

    //Node address high
    config.set(reg.REG_bNAH, nodeAddressHigh)

    //Node address low
    config.set(reg.REG_bNAL, nodeAddressLow)

    //Group address
    config.set(reg.REG_bGA, groupAddress)

    //Clock Manager
    config.set(reg.REG_bCM1, reg.bCM1_PLL_ENABLE | lockingSource | crystalDivider)

    //Transceiver Control Register
    config.set(reg.REG_bXCR, reg.bXCR_SLAVE | reg.bXCR_OUTPUT_ENABLE | bypass | reg.bXCR_ALL_BYPASS_DIS | reg.bXCR_REN_DIS)

    //Source Data control
    config.set(reg.REG_bSDC1, reg.bSDC1_ACTIVE_EDGE_EN | reg.bSDC1_DELAY_FIRST_BIT_EN | reg.bSDC1_SCK_INPUT | reg.bSDC1_SPDIF_EN | reg.bSDC1_TRANSPARENT_DIS | reg.bSDC1_UNMUTE_SOURCE)

    //Transceiver Status
    config.set(reg.REG_bXSR, reg.bXSR_LOCK_ERR_EN | reg.bXSR_CODING_ERR_MASK | reg.bXSR_SPDIF_ERR_MASK)

    //Interrupt Enable
    config.set(reg.REG_bIE, reg.bIE_RX_INT_EN | reg.bIE_ERR_INT_EN | reg.bIE_TX_INT_EN)

    //reset interrupts
    config.set(reg.REG_bMSGC, reg.bMSGC_RESET_MESSAGE_RX_INT | reg.bMSGC_RESET_MESSAGE_TX_INT | reg.bMSGC_RESET_ERR_INT | reg.bMSGC_RESET_NET_CONF_CHANGE)

    return config
}