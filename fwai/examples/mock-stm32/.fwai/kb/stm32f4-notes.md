# STM32F4 Development Notes

## Clock Configuration

The STM32F407VG uses an external 8MHz HSE crystal. The PLL is configured to produce
168MHz SYSCLK:

- HSE = 8 MHz
- PLL_M = 8 (VCO input = 1 MHz)
- PLL_N = 336 (VCO output = 336 MHz)
- PLL_P = 2 (SYSCLK = 168 MHz)
- PLL_Q = 7 (USB OTG FS = 48 MHz)

Bus clocks:
- AHB = 168 MHz (HPRE = 1)
- APB1 = 42 MHz (PPRE1 = 4)
- APB2 = 84 MHz (PPRE2 = 2)

## Memory Map

- Flash: 0x0800_0000 - 0x080F_FFFF (1 MB)
- SRAM1: 0x2000_0000 - 0x2001_FFFF (128 KB)
- SRAM2: 0x2002_0000 - 0x2002_3FFF (16 KB, for USB/Ethernet)
- CCM: 0x1000_0000 - 0x1000_FFFF (64 KB, CPU-only, no DMA)

## Boot Sequence

1. Reset vector → SystemInit() — configures FPU, sets VTOR
2. main() → HAL_Init() — configures SysTick, NVIC priority grouping
3. SystemClock_Config() — HSE + PLL → 168 MHz
4. BSP_Init() — GPIO, UART debug, LED
5. Application loop

Expected boot pattern: `[BOOT] System ready` within 2 seconds.

## Common Pitfalls

- **DMA on CCM RAM**: CCM (0x1000_0000) is not accessible by DMA. Never place DMA buffers there.
- **Flash wait states**: At 168 MHz, flash needs 5 wait states (LATENCY=5). Forgetting this causes hard faults.
- **GPIO speed**: High-speed GPIO (50-100 MHz) needs careful routing. Use medium speed unless required.
- **I2C pull-ups**: The STM32F4 has weak internal pull-ups. External 4.7kΩ pull-ups recommended for I2C.

## Debug UART

- USART2 on PA2 (TX) / PA3 (RX)
- 115200 baud, 8N1
- Connected to ST-Link virtual COM port
