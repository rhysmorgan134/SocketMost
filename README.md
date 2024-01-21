## SocketMost for use with [PiMost](https://shop.moderndaymods.com/products/pimost-hat-usb-c-power-most25-only)

### PiMost header info https://github.com/rhysmorgan134/SocketMost/wiki/PiMost

This is a library for use with the PiMost to allow Most Bus messages (Most 25 only) to be sent to various applications. This
package just gives out a json formatted string over a unix Datagram socket that can then be consumed through 
which ever application you wish. The implementation is currently at a very early stage, and has been tested
on a Jaguar and Land rover system running at 48khz. In theory 44.1khz should be useable but will need some configuration
changes around the registers (as a hint look into legacy start up mode, and only using the RX from the transceiver as the locking source) this is 
untested and no guarantee it will work in the way highlighted below.

### Installation

First clone this repo
```shell
git clone https://github.com/rhysmorgan134/SocketMost.git
cd SocketMost

```

### Installing NodeJS
If you don't have NodeJS installed you can use the help script to install it

```shell
chmod +x install_nodejs.sh
./install_nodejs.sh
```

### Building
To use the library it needs to be built

```shell
npm install
npm run build
```

#### Audio Drivers

The audio drivers have been modified from [this](https://github.com/AkiyukiOkayasu/RaspberryPi_I2S_Slave/tree/master) super useful overlay.
The piMost needs i2s audio, and luckily the clocking source is provided by the MOST network, so rather than having to deal with 
the awful Pi audio clocks, we get a great clean signal.

```shell
#change to the overlays directory
cd dtoverlays

#If using a pi4
cd pi

#Otherwise if using a pi5
cd pi5

#build the overlay
dtc -@ -H epapr -O dtb -o piMost48KhzStereo.dtbo -Wno-unit_address_vs_reg piMost48KhzStereo.dts

#copy the built overlay
sudo cp piMost48KhzStereo.dtbo /boot/overlays

#edit pulse audio config to default all audio the 48khz
sudo nano /etc/pulse/daemon.conf

#uncomment/edit the file to have the below
default-sample-format = s16le
default-sample-rate = 48000
alternate-sample-rate = 48000
default-sample-channels = 2
default-channel-map = front-left,front-right

#Save the file then proceed

arecord -l

#Take not of the card and device number

sudo nano /etc/pulse/default.pa

#add the below to the end of the file replace the 0 and 1 with you card and device number from above

load-module module-alsa-source device=hw:c,d
.ifexists module-udev-detect.so

```

#### Canbus Set up - Optional
If you wish to make use of the PiMost Canbus channel, then follow the below

```shell
sudo apt update
sudo apt install can-utils 
```

Then follow the optional steps in Boot Config section below

#### Graceful shut down

If the shutdown jumper is not in place, then after MOST network activity stops, power will be cut from the supply after ~30seconds.
The idea of this is that when MOST activity stops, we pick this up via GPIO, and after a configurable delay the Pi gets shutdown gracefully
then after 30 seconds of the last activity power then gets completely cut, lowering the consumption to around 0.5ma. This works with
both the USB-C power PiMost and also the 12v supply PiMost. Follow the relevant part of the Boot config section to enable this.

#### Boot config

Now we can set up the boot config options

```shell
sudo nano /boot/config.txt
```

Uncomment these two lines:
```shell
dtparam=i2s=on
dtparam=spi=on
```

At the bottom of the file add:
```shell
dtoverlay=piMost48KhzStereo
```

If you are using the canbus channel, also add
```shell
dtoverlay=mcp2515-can1,oscillator=16000000,interrupt=25
```

To enable auto shutdown we need to add the below line, the debounce value (milliseconds) allows a configurable delay before issuing an OS shutdown
this can be changed by preference, but needs to less than 30 seconds to allow a graceful shutdown before power is removed by
the PiMost.

<strike>
  
```shell
dtoverlay=gpio-shutdown,gpio_pin=26,active_low=0,debounce=2000
```
</strike>
This has changed, the status signal is also used within the driver, so creates an access error, it's recommended to implement within the driver by executing a shutdown command

### Software install

If you are still in the dtoverlay folder, change up two directories
```shell
cd ../..
```

Get the current directory 
```shell
pwd
```

If you have installed as the standard pi user the path should look like the below, if you have a custom user, then it should be the
same besides the user pi

```shell
/home/pi/SocketMost/examples/server.js
```

Take note of this, and then create a systemd file
```shell
sudo nano /etc/systemd/system/socketmost.service 
```

Paste the below code into the file, if needed change line that begins with ExecStart and working directory to match your path from above, if the user is not
pi then also change that value to match your username.
```shell
[Unit]
Description=socketmost
After=network.target

[Service]
ExecStart=node /home/pi/SocketMost/examples/server.js
Restart=always
WorkingDirectory=/home/pi/SocketMost/examples
User=pi

[Install]
WantedBy=default.target

```

Press `Cntrl X` followed by `Cntrl Y` to save the file

Now enable to service

```shell
systemctl enable socketmost.service
```

now reboot the pi
```shell
sudo reboot now
```

#### Testing

You should now be able to test the PiMost. Regardless of whether it is in a MOST network you should be able to look
at the systemd logs

```shell
journalctl -u socketmost.service -b
```

The output should be similar to the below

```shell
Jul 17 13:33:27 raspberrypi systemd[1]: Started socketmost.
Jul 17 13:33:30 raspberrypi node[577]: file exists
Jul 17 13:33:30 raspberrypi node[577]: { version: '1.0.0', nodeAddress: 272, groupAddress: 34 }
Jul 17 13:33:30 raspberrypi node[577]: running config
Jul 17 13:33:30 raspberrypi node[577]: 16 1 <Buffer 22>
Jul 17 13:33:30 raspberrypi node[577]: 0 138
Jul 17 13:33:30 raspberrypi node[577]: 1 1
Jul 17 13:33:30 raspberrypi node[577]: 0 139
Jul 17 13:33:30 raspberrypi node[577]: 1 16
Jul 17 13:33:30 raspberrypi node[577]: 0 137
Jul 17 13:33:30 raspberrypi node[577]: 1 <Buffer 22>
Jul 17 13:33:30 raspberrypi node[577]: 0 131
Jul 17 13:33:30 raspberrypi node[577]: 1 0
Jul 17 13:33:30 raspberrypi node[577]: 0 128
Jul 17 13:33:30 raspberrypi node[577]: 1 99
Jul 17 13:33:30 raspberrypi node[577]: 0 130
Jul 17 13:33:30 raspberrypi node[577]: 1 195
Jul 17 13:33:30 raspberrypi node[577]: 0 140
Jul 17 13:33:30 raspberrypi node[577]: 1 64
Jul 17 13:33:30 raspberrypi node[577]: 0 129
Jul 17 13:33:30 raspberrypi node[577]: 1 80
Jul 17 13:33:30 raspberrypi node[577]: 0 136
Jul 17 13:33:30 raspberrypi node[577]: 1 7
Jul 17 13:33:30 raspberrypi node[577]: 0 133
Jul 17 13:33:30 raspberrypi node[577]: 1 15

```

This shows a successful boot, and then the values written to registers on start up. If you want to test messaging and activity received over MOST
then run

```shell
cd ~/SocketMost
npm run test:messaging
```

If successful you should now see the below output

```shell
connecting /tmp/SocketMost.sock
connected
connected
```

If you don't then check the status of the socketmost service
```shell
systemctl status socketmost.service
```

and check the logs
```shell

```

If connected and you are on the MOST network, then you can wait to see a message, the output should be similar to the below

```shell
connecting /tmp/SocketMost.sock
connected
connected
{
  eventType: 'newMessage',
  type: 1,
  sourceAddrHigh: 1,
  sourceAddrLow: 97,
  data: {
    type: 'Buffer',
    data: [
      1, 2, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0,
      0, 0, 0
    ]
  }
}
{
  eventType: 'newMessage',
  type: 1,
  sourceAddrHigh: 1,
  sourceAddrLow: 97,
  data: {
    type: 'Buffer',
    data: [
      1, 2, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0,
      0, 0, 0
    ]
  }
}
```

#### Using Most-Explorer

I have created a visual tool to help with exploring the Most Bus. Binaries can be downloaded from here:

https://github.com/rhysmorgan134/most-explorer/releases

This can be run on a different computer to the pi (or the same if needed!) the first step is inside the socketmost root directory
run

```shell
npm run explorer:server
```

Then on the computer that has most-explorer installed, launch the app, after a few seconds it should find the socketmost server and you should see messages coming in.

### Events

The SocketMost service can emit multiple events, and also receive events, data should be sent over to the unix socket from the client
the client needs to be a datagram with a matching filename and location to below:

```shell
/tmp/SocketMost-client.sock
```

And connect to 
```shell
"/tmp/SocketMost.sock"
```

The events that the PiMost emits all follow the same json structure

```json
{
  "eventType": 'event type is here',
  "data": 'data that relates to the event goes here'
}
```

Possible events and their structures are below

##### newMessage
```javascript
{
  "eventType": "newMessage",
  "type": 1, //message type as received and specified in the most specification
  "sourceAddrHigh": 1, //source address of the message high bye
  "sourceAddrLow": 97, //source address of the message low bye
  "data": { //data packet
    "type": "Buffer", //inserted from the PiMost service to specify its a buffer
    "data": [1, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] //The actual data buffer, values can be parsed out FBlock, Function etc as per the MOST spec
  }
}
```

##### locked
```javascript
{
  "eventType": "locked" //PiMost is locked onto the network and ready to send and receive messages
}
```

##### unlocked
```javascript
{
  "eventType": "unlocked" //PiMost is not locked to the network and will not service message requests
}
```

##### positionUpdate
```javascript
{
  "eventType": "positionUpdate" //PiMost is not locked to the network and will not service message requests
  "nodePostion": 3 //Position relative to the master, Netblock Function block, must use the as the instance ID in the user application
  "maxPositon": 5 //Max position of last node on the ring
}
```

##### messageSent
```javascript
{
  "eventType": 'messageSent' //request to send message has been completed successfully, ready to send next
}
```

##### masterFound - important as MOST communication kicks off from the master, typical flow is master requests function blocks-> applic respond with implemented blocks
```javascript
{
  "eventType": "masterFound" //Network master has been identified
  "instanceID":  1, //network master instance id
  "sourceAddrHigh": 1 //network master source address high
  "sourceAddrLow" 45 //network master source address low
}
```

#### allocResult
```javascript
{
  "eventType": "allocResult",
  "loc1": 4, //first byte that has been assigned to the PiMost and the first byte that PiMost Audio is inserted to
  "loc2":  5, //second byte that has been assigned to the PiMost and the second byte that PiMost Audio is inserted to
  "loc3":  6, //third byte that has been assigned to the PiMost and the third byte that PiMost Audio is inserted to
  "loc4":  7, //fourth byte that has been assigned to the PiMost and the fourth byte that PiMost Audio is inserted to
  "cl": 4, //connection label for the PiMost to de-allocate
  "answer1": "ALLOC_GRANT", //Allocation response
  "freeChannels": 20 //Amount of remaining free channels
}
```


The PiMost can also receive events in the same way, these are listed below, the format must match and be a json string sent over the UDP socket

##### sendControlMessage
```javascript
{
  "eventType": "sendControlMessage",
  "targetAddressHigh": 1, //MOST node address high byte to send the message to
  "targetAddressLow": 97, //MOST node address low byte to send the message to
  "fBlockID": 1, //Most function block that the messsage relates to, Network Master is the example here
  "instanceID": 0, //The instance ID of the above FBlock, network Master is always 0
  "fktId": 0, //The function ID that the message relates to
  "opType": 12, //OpType 12=status, full enumerations are in the MOST Book
  "data": [] //The raw data to go with the message, the SocketMost service handles TelID, TelLength etc. Currently only single part sends are supported
}
```

##### getNodePosition
```javascript
{
  "eventType": "getNodePosition" //SocketMost will emit positionUpdate with response
}
```

##### getMaster
```javascript
{
  "eventType": "getMaster" //SocketMost will emit masterFound with response
}
```

##### allocate - request allocation of 4 bytes for streaming audio onto the bus
```javascript
{
  "eventType": "allocate" //SocketMost will emit allocResult with reference to the PiMosts Streaming bytes
}
```
