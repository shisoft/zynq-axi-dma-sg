# Zynq AXI DMA transfer with Scatter/Gather

This is a simple C snippet to demonstrate how DMA transfer with scatter/gather works on a Zynq 7020. It is used to run as a Linux program. 

In contrast to other examples it makes no usage of the Xilinx Linux drivers, so there is no need to recompile your kernel from [linux-xlnx](https://github.com/Xilinx/linux-xlnx).

It maps several memory areas to set the AXI registers at the programming logic, and the memory wich is intended to transfer to the FPGA (S2MM: Stream to Mapped Memory), and write back from FPGA to the memory (MM2S: Mapped Memory to Stream). 

According to the Xilinx documentation [**AXI DMA v7.1 - LogiCORE IP Product Guide**](http://www.xilinx.com/support/documentation/ip_documentation/axi_dma/v7_1/pg021_axi_dma.pdf), it constructs a descriptor chain. Each descriptor contains the address of the next descriptor, the target memory buffer address and the related control settings (width of the transfer, first or last transfer).

To test the successful transfer of the memory content, the source memory will be initialized with an increasing counter and the target memory with zeros.  

## Compatibility 

It is tested and runs without problems on a Parallella board with Zynq 7020 (under Ubuntu 14.04 Parallella (Zynq7020) headless image from Jan 30th 2015 release). It should also work with any Zed board with an Zynq 7020 under the assumption that 1GByte memory is available.

## Build  

Compile it native under Linux ARM with 

```
gcc -Wall -o zynq-axi-dma-sg zynq-axi-dma-sg.c
```

*Note: because of the memory map with /dev/mem it can only run as root.*

## Run

First you need to configure the devicetree to prevent the kernel from using the memory area shared with the programming logic of the Zynq (`mem=512M`). To get the maximum performance it is helpful to bind all linux processes to one cpu (`isolcpus=1`).

```text
chosen {
	linux,stdout-path = "/amba@0/serial@e0001000";
	bootargs = "root=/dev/mmcblk0p2 rw earlyprintk rootfstype=ext4 rootwait mem=512M isolcpus=1";
};
```

On the FPGA side there must be a programming logic with AXI Stream configured. A good start is the [parallella-fpga-dummy-io](https://github.com/Kirill888/parallella-fpga-dummy-io). There is also a howto concerning editing and compiling the devicetree. 

To enable Scatter/Gather in Vivado, open the block design and double click on the `axi_dma_0` and set the buffer register length to 23 , the memory map read width to 1024, stream data width and max burst size to 32.

Also in the block design the following addresses must be set:

| Slave Interface| Base Name|  Offset Address |	 Range	| High Address|
| -------------|-------------|-------------|-------------|-------------|
| Data_SG (32 address bits : 4G)|
| S_AXI_HP0	| HP0_DDR_LOWOCM	| 0x2000_0000	| 128M	| 0x27FF_FFFF|
| S_AXI_HP1	| HP1_DDR_LOWOCM	| 0x2800_0000	| 128M	| 0x2FFF_FFFF|
| S_AXI_HP2	| HP2_DDR_LOWOCM	| 0x3000_0000	| 128M	| 0x37FF_FFFF|
| S_AXI_HP3	| HP3_DDR_LOWOCM	| 0x3800_0000	| 128M	| 0x3FFF_FFFF|
| Data_MM2S (32 address bits : 4G)|
| S_AXI_HP0	| HP0_DDR_LOWOCM	| 0x2000_0000	| 128M	| 0x27FF_FFFF|
| S_AXI_HP1	| HP1_DDR_LOWOCM	| 0x2800_0000	| 128M	| 0x2FFF_FFFF|
| S_AXI_HP2	| HP2_DDR_LOWOCM	| 0x3000_0000	| 128M	| 0x37FF_FFFF|
| S_AXI_HP3	| HP3_DDR_LOWOCM	| 0x3800_0000	| 128M	| 0x3FFF_FFFF|
| Data_S2MM (32 address bits : 4G)|
| S_AXI_HP0	| HP0_DDR_LOWOCM	| 0x2000_0000	| 128M	| 0x27FF_FFFF|
| S_AXI_HP1	| HP1_DDR_LOWOCM	| 0x2800_0000	| 128M	| 0x2FFF_FFFF|
| S_AXI_HP2	| HP2_DDR_LOWOCM	| 0x3000_0000	| 128M	| 0x37FF_FFFF|
| S_AXI_HP3	| HP3_DDR_LOWOCM	| 0x3800_0000	| 128M	| 0x3FFF_FFFF|
| Data (32 address bits : 0x40000000 [ 1G ])|
| S_AXI_LITE| Reg               | 0x4040_0000	| 64K	| 0x4040_FFFF|

*Note: both the memory mapped to stream and the stream to memory mapped area are set to the same addresses.*

Start the transfer with:

```bash
taskset -1 ./zynq-axi-dma-sg
```

The `taskset -c 1` advises the kernel to use the second core for the task. Especially for massive memory mapped operations this results in at least 10% higher performance. 

If nothing goes wrong, the following status messages should appear several times:

```cpp
Memory-mapped to stream status (0x00010008@0x04):
MM2S_STATUS_REGISTER status register values:
 running SGIncld
Stream to memory-mapped status (0x00010008@0x34):
S2MM_STATUS_REGISTER status register values:
 running SGIncld
```

After ~6600 times it should finish with the success message:

```cpp
Memory-mapped to stream status (0x0001100a@0x04):
MM2S_STATUS_REGISTER status register values:
 running idle SGIncld IOC_Irq
Stream to memory-mapped status (0x0001100a@0x34):
S2MM_STATUS_REGISTER status register values:
 running idle SGIncld IOC_Irq
```

In both channels, the status register `idle` (bit 1) and `ÌOC_Irq` (bit 12) are set. This means the engine passed the tail descriptor without errors and fired the `IRQ on complete`. If there is only one process communicating with the AXI engine, there is no need to manually halt the engine.  


## Performance

This sample transfers 7 frames with 8192000 Bytes (~8MByte) each from memory to the FPGA and writes the received data back to a different memory address.

It takes between 0.071754 and 0.071772 sec to complete both processes. This means that in total it reads and writes with a bandwidth of 799 MByte/s each. According to the Xilinx documentation **LogiCORE IP Product Guide** (page 9) the theoretical limit of AXI Stream is close to 400MByte. It is unclear where the difference come from.

Some tests to use multiple interfaces (there are up to four available, both for S2MM and MM2S) result in no higher performance. The limit (at least on the parallella board) could be 800 MByte/s if both directions are used, which means 1.6 GByte/s or 12.8 Gbit/s.  


## Initiate Scatter/Gather via a lib call

Under [libcallfpga](https://github.com/OpenDGPS/zynq-axi-dma-sg/libcallfpga) you'll find a simple nodejs implenetation to initiate the memory transfer via a library call. It is minor changed to propagate a function called callfpga instead of the main func. Compile it by 

```bash
gcc -fPIC -c zynq-axi-dma-sg.c
gcc -shared -o libcallfpga.so zynq-axi-dma-sg.o
```

and run the node script by (**as root because of memory mapping**)

```bash
node libcall.js
```

Based on the perfomance measurement it is possible to implement a matrix multiplication on the PL part which is able to calculate more than four million 8x8 (8bit int) matrizes or even eight million 4x4 (16bit int) in a second. This is because on each scatter/gather cycle there are 1024 bit available which can represent two matrizes with 8x8 on 8bit width. 

The PL clock is usually around 200MHz. And between every available input there are around 6000 clock cycles for a calculation pipeline. Let assume you have to additional calculations like matrix addition it is possible to store one matrix result in one part of target memory and the second result in the other part.

Always be prepaired that there is a misalignment between read and write memory address. Which means you'll find garbage in the first 1024 bit of the target memory. This is because of the deferral between reading and writing the memory.  


## Notes

The C code is generated by XSLT templates. This should explain the absence of functions. It's  used as a small part of a much larger toolchain which configures not only the code for the ARM side but also the VHDL code. 

For further informations on AXI DMA transfer there is an good article to start at [Lauri's Blog](http://lauri.võsandi.com/hdl/zynq/xilinx-dma.html). 

At [FPGADeveloper](http://www.fpgadeveloper.com/2014/08/using-the-axi-dma-in-vivado.html) there is an example of how to use the AXI DMA (Scatter/Gather enabled) engine as standalone  (https://github.com/fpgadeveloper/microzed-axi-dma/blob/master/SDK/hello_world/src/helloworld.c). Unfortunately, it also uses the Xilinx drivers. In principle it should be possible to use `zynq-axi-dma-sg` instead.


