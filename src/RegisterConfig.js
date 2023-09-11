"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRegisterConfig = void 0;
const Registers_1 = require("./Registers");
function getRegisterConfig({ nodeAddressLow, nodeAddressHigh, groupAddress }, mode) {
    console.log(nodeAddressLow, nodeAddressHigh, groupAddress);
    const config = new Map();
    // Testing for 44.1khz, this is untested and just configured as per datasheet, if running at 44.1khz then the crystal is not compatible, so the chip has to be started up in legacy mode
    // and the locking source needs to be set to the RX network.
    const lockingSource = mode === 1 ? Registers_1.Registers.bCM1_PLL_INPUT_CRYSTAL : Registers_1.Registers.bCM1_PLL_INPUT_MOST;
    const crystalDivider = mode === 1 ? Registers_1.Registers.bCM1_CRYSTAL_DIVIDER_384F : Registers_1.Registers.bCM1_CRYSTAL_DIVIDER_256F;
    const bypass = mode === 1 ? Registers_1.Registers.bXCR_ENHANCED_BYPASS : Registers_1.Registers.bXCR_LEGACY_BYPASS;
    // SCK as output
    // config.set(reg.REG_bSDC1, reg.bSDC1_SCK_OUTPUT)
    // //Clear power on int
    // config.set(reg.REG_bMSGC, reg.bMSGC_RESET_ERR_INT)
    // Node address high
    config.set(Registers_1.Registers.REG_bNAH, nodeAddressHigh);
    // Node address low
    config.set(Registers_1.Registers.REG_bNAL, nodeAddressLow);
    // Group address
    config.set(Registers_1.Registers.REG_bGA, groupAddress);
    // Clock Manager
    config.set(Registers_1.Registers.REG_bCM1, Registers_1.Registers.bCM1_PLL_ENABLE | lockingSource | crystalDivider);
    if (mode === 0) {
        config.set(Registers_1.Registers.REG_bSDC3, Registers_1.Registers.bSDC3_MUTE_SOURCE_PORTS | Registers_1.Registers.bSDC3_SOURCE_PORT_DIS);
    }
    if (mode === 0) {
        config.set(Registers_1.Registers.REG_bCM3, Registers_1.Registers.bCM3_FREN_DIS |
            Registers_1.Registers.bCM3_AUTO_CRYSTAL_DIS |
            Registers_1.Registers.bCM3_DIS_AUTO_SWITCH_CLOCK |
            Registers_1.Registers.bCM3_FREQ_REG_RESET);
    }
    // Transmitter control
    config.set(Registers_1.Registers.REG_bXCR, Registers_1.Registers.bXCR_SLAVE |
        Registers_1.Registers.bXCR_OUTPUT_ENABLE |
        bypass |
        Registers_1.Registers.bXCR_ALL_BYPASS_DIS |
        Registers_1.Registers.bXCR_REN_DIS);
    // Source Data control
    config.set(Registers_1.Registers.REG_bSDC1, Registers_1.Registers.bSDC1_ACTIVE_EDGE_EN |
        Registers_1.Registers.bSDC1_DELAY_FIRST_BIT_EN |
        Registers_1.Registers.bSDC1_POLARITY_FSY_FALLING |
        Registers_1.Registers.bSDC1_NO_CYCLES_DEF |
        Registers_1.Registers.bSDC1_SCK_OUTPUT |
        Registers_1.Registers.bSDC1_TRANSPARENT_DIS |
        Registers_1.Registers.bSDC1_UNMUTE_SOURCE |
        Registers_1.Registers.bSDC1_SPDIF_DIS);
    // set sck rate
    config.set(Registers_1.Registers.REG_bSDC2, Registers_1.Registers.bSDC2_SCK_32F);
    // Transceiver Status
    config.set(Registers_1.Registers.REG_bXSR, Registers_1.Registers.bXSR_CODING_ERR_MASK | Registers_1.Registers.bXSR_SPDIF_ERR_MASK | Registers_1.Registers.bXSR_LOCK_ERR_MASK);
    // Interrupt Enable
    config.set(Registers_1.Registers.REG_bIE, Registers_1.Registers.bIE_RX_INT_EN | Registers_1.Registers.bIE_ERR_INT_EN | Registers_1.Registers.bIE_TX_INT_EN);
    // reset interrupts
    config.set(Registers_1.Registers.REG_bMSGC, Registers_1.Registers.bMSGC_RESET_MESSAGE_RX_INT |
        Registers_1.Registers.bMSGC_RESET_MESSAGE_TX_INT |
        Registers_1.Registers.bMSGC_RESET_ERR_INT |
        Registers_1.Registers.bMSGC_RESET_NET_CONF_CHANGE);
    return config;
}
exports.getRegisterConfig = getRegisterConfig;
