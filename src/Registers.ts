export enum Registers {
    // Registers
    REG_bXCR = 0x80,
    REG_bXSR = 0x81,
    REG_bSDC1 = 0x82,
    REG_bCM1 = 0x83,
    REG_bNC = 0x84,
    REG_bMSGC = 0x85,
    REG_bMSGS = 0x86,
    REG_bNPR = 0x87,
    REG_bIE = 0x88,
    REG_bGA = 0x89,
    REG_bNAH = 0x8a,
    REG_bNAL = 0x8b,
    REG_bSDC2 = 0x8c,
    REG_bSDC3 = 0x8d,
    REG_bCM2 = 0x8e,
    REG_bNDR = 0x8f,
    REG_bMPR = 0x90,
    REG_bMDR = 0x91,
    REG_bCM3 = 0x92,
    REG_bCM4 = 0x93,
    REG_bFRHL = 0x94,
    REG_bFRLO = 0x95,
    REG_bSBC = 0x96,
    REG_bXSR2 = 0x97,
    REG_mRCMB = 0xa0,
    REG_bXTIM = 0xbe,
    REG_bXRTY = 0xbf,
    REG_mXCMB = 0xc0,
    REG_bXTS = 0xd5,
    REG_bPCTC = 0xe2,
    REG_bPCTS = 0xe3,
    REG_bAPAH = 0xe8,
    REG_bAPAL = 0xe9,
    REG_bPSTX = 0xea,
    REG_bPLDT = 0xec,
    REG_bPPI = 0xf2,
    REG_mARP = 0x180,
    REG_mAXP = 0x1c0,
    REG_bXLRTY = 0x3c0,
    REG_bXSTIM = 0x3c1,

    // Register bXCR Transceiver Control Register 0x80
    bXCR_MASTER = 0x80,
    bXCR_SLAVE = 0x00, // Default

    bXCR_OUTPUT_ENABLE = 0x40,
    bXCR_OUTPUT_DISABLE = 0x00, // Default

    bXCR_LEGACY_BYPASS = 0x20,
    bXCR_ENHANCED_BYPASS = 0x00,

    bXCR_LOWPOWER_WAKE_EN = 0x00, // Default
    bXCR_LOWPOWER_WAKE_DIS = 0x10,

    bXCR_STANDALONE_EN = 0x08,
    bXCR_STANDALONE_DIS = 0x00, // Default

    bXCR_SOURCE_BYPASS_DIS = 0x00, // Default
    bXCR_SOURCE_BYPASS_EN = 0x04,

    bXCR_ALL_BYPASS_EN = 0x00,
    bXCR_ALL_BYPASS_DIS = 0x02,

    bXCR_REN_EN = 0x00, // Default
    bXCR_REN_DIS = 0x01,

    // Register bXSR Transceiver Status Register 0x81
    bXSR_FREQ_REG_ACT = 0x80,
    bXSR_FREQ_REG_INACT = 0x00,

    bXSR_SPDIF_ERR_MASK = 0x40, // Default
    bXSR_SPDIF_ERR_EN = 0x00,

    bXSR_LOCK_ERR_MASK = 0x20,
    bXSR_LOCK_ERR_EN = 0x00, // Default

    bXSR_CODING_ERR_MASK = 0x10, // Default
    bXSR_CODING_ERR_EN = 0x00,

    bXSR_ERR_ACT = 0x08,
    bXSR_ERR_CLR = 0x00,

    bXSR_FREQ_REG_LOCKED = 0x04,
    bXSR_FREQ_REG_UNLOCKED = 0x00,

    bXSR_SPDIF_LOCK_ACT = 0x02,
    bXSR_SPDIF_LOCK_INACT = 0x00,

    bXSR_TRANS_LOCK_ACT = 0x01,
    bXSR_TRANS_LOCK_INACT = 0x00,

    // Register bSDC1 Source Data Control Register 0x82
    bSDC1_ACTIVE_EDGE_EN = 0x80,
    bSDC1_ACTIVE_EDGE_DIS = 0x00,

    bSDC1_DELAY_FIRST_BIT_EN = 0x40,
    bSDC1_DELAY_FIRST_BIT_DIS = 0x00,

    bSDC1_POLARITY_FSY_RISING = 0x20,
    bSDC1_POLARITY_FSY_FALLING = 0x00,

    bSDC1_SCK_OUTPUT = 0x10,
    bSDC1_SCK_INPUT = 0x00,

    bSDC1_NO_CYCLES_DEF = 0x00,
    bSDC1_NO_CYCLES_DIV = 0x08,

    bSDC1_SPDIF_EN = 0x04,
    bSDC1_SPDIF_DIS = 0x00,

    bSDC1_MUTE_SOURCE = 0x00,
    bSDC1_UNMUTE_SOURCE = 0x02,

    bSDC1_TRANSPARENT_EN = 0x00,
    bSDC1_TRANSPARENT_DIS = 0x01,

    // Register bCM1 Clock Manager 1 0x83
    bCM1_PLL_DISABLE = 0x80,
    bCM1_PLL_ENABLE = 0x00,

    bCM1_RMCK_DIV_384F = 0x00, // Default
    bCM1_RMCK_DIV_256F = 0x10,
    bCM1_RMCK_DIV_128F = 0x20,
    bCM1_RMCK_DIV_64F = 0x30,
    bCM1_RMCK_DIV_1536F = 0x40,
    bCM1_RMCK_DIV_1024F = 0x50,
    bCM1_RMCK_DIV_768F = 0x60,
    bCM1_RMCK_DIV_512F = 0x70,

    bCM1_CRYSTAL_DIVIDER_256F = 0x00,
    bCM1_CRYSTAL_DIVIDER_384F = 0x04,

    bCM1_PLL_INPUT_MOST = 0x00,
    bCM1_PLL_INPUT_SR0 = 0x01,
    bCM1_PLL_INPUT_CRYSTAL = 0x02,
    bCM1_PLL_INPUT_SCK = 0x03,

    // Register bMSGC Message Control Register 0x85
    bMSGC_START_TX = 0x80,
    bMSGC_STOP_TX = 0x00,

    bMSGC_RECEIVE_BUFF_EN = 0x40,
    bMSGC_RECEIVE_BUFF_DIS = 0x00,

    bMSGC_RESERVED = 0x00,

    bMSGC_START_ADDRESS_INIT_EN = 0x10,
    bMSGC_START_ADDRESS_INIT_DIS = 0x00,

    bMSGC_RESET_NET_CONF_CHANGE = 0x08,

    bMSGC_RESET_ERR_INT = 0x04,

    bMSGC_RESET_MESSAGE_TX_INT = 0x02,

    bMSGC_RESET_MESSAGE_RX_INT = 0x01,

    // Register bMSGS Message Status Register 0x86
    bMSGS_RECEIVE_BUFF_STATUS_READY = 0x00,
    bMSGS_RECEIVE_BUFF_STATUS_FULL = 0x80,

    bMSGS_TRANS_SUCCESS = 0x40,

    bMSGS_NET_CHANGED = 0x08,

    bMSGS_ERR = 0x04,

    bMSGS_MESS_TRANSMITTED = 0x02,

    bMSGS_MESS_RECEIVED = 0x01,

    // Register bIE Interrupt Enable Register
    bIE_NET_CHANGED_INT_EN = 0x08,
    bIE_ERR_INT_EN = 0x04,
    bIE_TX_INT_EN = 0x02,
    bIE_RX_INT_EN = 0x01,

    // Register source control 2
    bSDC2_SCK_8F = 0x0,
    bSDC2_SCK_16F = 0x20,
    bSDC2_SCK_32F = 0x40,
    bSDC2_SCK_64F = 0x60,
    bSDC2_SCK_128F = 0x80,
    bSDC2_SCK_256F = 0xa0,

    // Clock Manager 2
    bCM2_UNLOCKED = 0x80,
    BCM2_NETWORK_ACTIVITY = 0x40,

    /// //Legacy testing/////
    // bSDC3
    bSDC3_MUTE_SOURCE_PORTS = 0x02,
    bSDC3_UNMUTE_SOURCE_PORTS = 0x00,

    bSDC3_SOURCE_PORT_EN = 0x00,
    bSDC3_SOURCE_PORT_DIS = 0x01,

    // bCM3
    bCM3_FREN_EN = 0x10,
    bCM3_FREN_DIS = 0x00,

    bCM3_ENH = 0x40,

    bCM3_AUTO_SWITCH_CLOCK = 0x08,
    bCM3_DIS_AUTO_SWITCH_CLOCK = 0x00,

    bCM3_AUTO_CRYSTAL_EN = 0x04,
    bCM3_AUTO_CRYSTAL_DIS = 0x00,

    bCM3_FREQ_REG_RESET = 0x02
}

export type Register = keyof typeof Registers
