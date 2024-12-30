// @ts-nocheck
'use client'
import React, { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Battery, Activity, RotateCw, Terminal, Download, Circle } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import moment from 'moment';


const PowerMeterApp = () => {
  const [device, setDevice] = useState(null);
  const [configService, setConfigService] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPower, setCurrentPower] = useState(0);
  const [cadence, setCadence] = useState(0);
  const [battery, setBattery] = useState(100);
  const [logs, setLogs] = useState([]);
  const [powerHistory, setPowerHistory] = useState([]);
  const [calibrationStep, setCalibrationStep] = useState(0);
  const [calibrationSide, setCalibrationSide] = useState('left');
  const [calibrationWeight, setCalibrationWeight] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedData, setRecordedData] = useState([]);
  const [recordingStartTime, setRecordingStartTime] = useState(null);

  // New state for command input
  const [customCommand, setCustomCommand] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY = 2000; // 2 seconds



  useEffect(() => {
    if (device) {
      
      device.addEventListener('gattserverdisconnected', handleDisconnection);
      return () => {
        device.removeEventListener('gattserverdisconnected', handleDisconnection);
      };
    }
  }, [device]);

  const handleDisconnection = async () => {
    console.log('Device disconnected');
    setIsConnected(false);
    setIsReconnecting(true);
    
    try {
      await attemptReconnection();
    } catch (error) {
      console.error('Failed to reconnect:', error);
      resetConnection();
    }
  };

  const attemptReconnection = async () => {
    while (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      console.log(`Reconnection attempt ${reconnectAttempts + 1} of ${MAX_RECONNECT_ATTEMPTS}`);
      
      try {
        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));
        const device = await navigator.bluetooth.getDevices();
        console.log(device)
        const server = await device.gatt.connect();
        const powerService = await server.getPrimaryService('00001818-0000-1000-8000-00805f9b34fb');
        const configService = await server.getPrimaryService('0000cafe-0000-1000-8000-00805f9b34fb');
        const batteryService = await server.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb');
          
        setConfigService(configService);
        setIsConnected(true);
        setIsReconnecting(false);
        setReconnectAttempts(0);
        
        await setupNotifications(powerService, configService, batteryService);
        
        console.log('Reconnection successful');
        return;
      } catch (error) {
        console.log(`Reconnection attempt failed: ${error}`);
        setReconnectAttempts(prev => prev + 1);
      }
    }
    
    throw new Error('Max reconnection attempts reached');
  };

  const resetConnection = () => {
    setDevice(null);
    setConfigService(null);
    setIsConnected(false);
    setIsReconnecting(false);
    setReconnectAttempts(0);
    // Reset other state as needed
    setCurrentPower(0);
    setCadence(0);
    setBattery(100);
    setLogs([]);
    setPowerHistory([]);
  };

  const commandGroups = {
    calibration: [
      { cmd: 'CLW', desc: 'Calibrate left using weight', param: 'kg' },
      { cmd: 'CRW', desc: 'Calibrate right using weight', param: 'kg' },
      { cmd: 'CLF', desc: 'Calibrate left using force', param: 'N' },
      { cmd: 'CRF', desc: 'Calibrate right using force', param: 'N' },
      { cmd: 'CLS', desc: 'Calibration left set', param: 'value' },
      { cmd: 'CRS', desc: 'Calibration right set', param: 'value' },
      { cmd: 'CG', desc: 'Calibration get', param: null },
      { cmd: 'CA', desc: 'Calibration apply', param: null },
      { cmd: 'CV', desc: 'Calibration verify', param: null },
      { cmd: 'CP', desc: 'Calibration persist', param: null },
      { cmd: 'CL', desc: 'Calibration leave', param: null }
    ],
    settings: [
      { cmd: 'GCR', desc: 'Get crank radius', param: null },
      { cmd: 'SCR', desc: 'Set crank radius', param: 'm or mm' },
      { cmd: 'GED', desc: 'Get exponential decay', param: null },
      { cmd: 'SED', desc: 'Set exponential decay', param: '0-1 / %' },
      { cmd: 'GPAR', desc: 'Get power averaging over revolution', param: null },
      { cmd: 'SPAR', desc: 'Set power averaging over revolution', param: '0...n' },
      { cmd: 'GIPM', desc: 'Get instant power measure', param: null },
      { cmd: 'SIPM', desc: 'Set instant power measure', param: '0 / 1' },
      { cmd: 'GCLB', desc: 'Get active calibration values', param: null }
    ],
    system: [
      { cmd: 'OC', desc: 'Start offset compensation', param: null },
      { cmd: 'LM', desc: 'Log mode set', param: 'mode' }
    ]
  };

  const handleCommandClick = async (cmd, requiresValue = false) => {
    if (requiresValue && !customValue) {
      alert('Please enter a value for this command');
      return;
    }
    const fullCommand = requiresValue ? `${cmd}${customValue}` : cmd;
    await sendCommand(fullCommand);
    setCustomValue(''); // Clear value after sending
  };

  // BLE Connection
  const connectDevice = async () => {
    try {
      const optionalServices = ['00001818-0000-1000-8000-00805f9b34fb',
                              '0000cafe-0000-1000-8000-00805f9b34fb', 
                              '0000180f-0000-1000-8000-00805f9b34fb']
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: optionalServices // Config Service and Battery Service
      });
      
      const server = await device.gatt.connect();
      const powerService = await server.getPrimaryService('00001818-0000-1000-8000-00805f9b34fb');
      const configService = await server.getPrimaryService('0000cafe-0000-1000-8000-00805f9b34fb');
      const batteryService = await server.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb');
      
      setDevice(device);
      setConfigService(configService);
      setIsConnected(true);
      
      // Subscribe to notifications
      setupNotifications(powerService, configService, batteryService);
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  // Setup notifications for power, battery and logs
  const setupNotifications = async (powerService, configService, batteryService) => {
    try {
      // Power Measurement
      const powerChar = await powerService.getCharacteristic(parseInt('0x2A63'));
      await powerChar.startNotifications();
      powerChar.addEventListener('characteristicvaluechanged', handlePowerData);

      // Battery Level
      const batteryChar = await batteryService.getCharacteristic(parseInt('0x2A19'));
      await batteryChar.startNotifications();
      batteryChar.addEventListener('characteristicvaluechanged', handleBatteryData);

      // Monitor Characteristic
      const monitorChar = await configService.getCharacteristic('5abc3692-fca4-4a69-955d-cd0442de273f');
      await monitorChar.startNotifications();
      monitorChar.addEventListener('characteristicvaluechanged', handleLogData);
    } catch (error) {
      console.error('Failed to setup notifications:', error);
    }
  };

  // Handle incoming power data
  const handlePowerData = (event) => {
    const value = event.target.value;
    const power = value.getUint16(2, true);
    const timestamp = Date.now();
    
    setCurrentPower(power);
    setPowerHistory(prev => [...prev, { time: timestamp, power }].slice(-60));
    
    const currentCadence = value.getUint16(4, true);
    setCadence(currentCadence);

    // Record data if recording is active
    if (isRecording) {
      const timeOffset = timestamp - recordingStartTime;
      setRecordedData(prev => [...prev, {
        timestamp: timeOffset,
        power: power,
        cadence: currentCadence
      }]);
    }
  };

  const startRecording = () => {
    setIsRecording(true);
    setRecordingStartTime(Date.now());
    setRecordedData([]);
  };

  const stopRecording = () => {
    setIsRecording(false);
  };

  const downloadRecordedData = () => {
    // Create CSV content
    const headers = 'timestamp_ms,power_watts,cadence_rpm\n';
    const csvContent = recordedData.map(row => 
      `${row.timestamp},${row.power},${row.cadence}`
    ).join('\n');
    
    const blob = new Blob([headers + csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `power_data_${new Date().toISOString()}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };


  // Handle battery updates
  const handleBatteryData = (event) => {
    setBattery(event.target.value.getUint8(0));
  };

  // Handle log messages
  const handleLogData = (event) => {
    const decoder = new TextDecoder();
    const logMessage = decoder.decode(event.target.value);
    setLogs(prev => [{ time: new Date().toLocaleTimeString(), message: logMessage }, ...prev]);
  };

  // Send command to device
  const sendCommand = async (command) => {
    try {
      const controlChar = await configService.getCharacteristic('35916a45-9726-4ef4-b09d-f3284968f03c');
      const encoder = new TextEncoder();
      await controlChar.writeValue(encoder.encode(command));
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  };

  // Handle calibration steps
  const handleCalibration = async () => {
    switch (calibrationStep) {
      case 0:
        setCalibrationStep(1);
        break;
      case 1:
        await sendCommand(`C${calibrationSide === 'left' ? 'L' : 'R'}W${calibrationWeight}`);
        setCalibrationStep(2);
        break;
      case 2:
        await sendCommand('CA'); // Apply calibration
        setCalibrationStep(3);
        break;
      case 3:
        await sendCommand('CP'); // Persist calibration
        setCalibrationStep(0);
        break;
    }
  };

  const recordingControls = (
    <div className="mt-4 flex justify-between items-center">
      <div className="flex items-center gap-4">
        <Button 
          onClick={isRecording ? stopRecording : startRecording}
          variant={isRecording ? "destructive" : "default"}
          className="flex items-center gap-2"
        >
          <Circle className={`w-4 h-4 ${isRecording ? "animate-pulse text-red-500" : ""}`} />
          {isRecording ? "Stop Recording" : "Start Recording"}
        </Button>
        
        {recordedData.length > 0 && (
          <Button 
            onClick={downloadRecordedData}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </Button>
        )}
      </div>
      
      {isRecording && (
        <div className="text-sm text-gray-500">
          Recording: {formatDuration(Date.now() - recordingStartTime)}
          {` (${recordedData.length} samples)`}
        </div>
      )}
    </div>
  );
   // Helper function to format duration
   const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto p-4">
      {isReconnecting && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Lost</AlertTitle>
          <AlertDescription>
            Attempting to reconnect... Try {reconnectAttempts + 1} of {MAX_RECONNECT_ATTEMPTS}
          </AlertDescription>
        </Alert>
      )}

      {!isConnected ? (
        <div className="space-y-4">
          {reconnectAttempts >= MAX_RECONNECT_ATTEMPTS && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Connection Failed</AlertTitle>
              <AlertDescription>
                Unable to reconnect to the device. Please try connecting again.
              </AlertDescription>
            </Alert>
          )}
          <Button 
            onClick={connectDevice} 
            className="w-full"
            disabled={isReconnecting}
          >
            {isReconnecting ? 'Reconnecting...' : 'Connect to Power Meter'}
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="power" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="power">Power Data</TabsTrigger>
            <TabsTrigger value="calibrate">Calibrate</TabsTrigger>
            <TabsTrigger value="dev">Developer</TabsTrigger>
          </TabsList>


          <TabsContent value="power">
            <div className="grid gap-4">
              
              <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-6 h-6" />
                Current Power
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{currentPower}W</div>
              <LineChart width={600} height={200} data={powerHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" domain = {['auto', 'auto']}
                  name = 'Time'
                  tickFormatter = {(unixTime) => moment(unixTime).format('HH:mm:ss')}
                  type = 'number' />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="power" stroke="#8884d8" />
              </LineChart>
              {recordingControls}
            </CardContent>
          </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RotateCw className="w-6 h-6" />
                      Cadence
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{cadence} RPM</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Battery className="w-6 h-6" />
                      Battery
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{battery}%</div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="calibrate">
            <Card>
              <CardHeader>
                <CardTitle>Calibration Wizard</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {calibrationStep === 0 && (
                    <div>
                      <h3 className="text-lg font-medium">Start Calibration</h3>
                      <p className="text-sm text-gray-500 mb-4">
                        Please select the side to calibrate and enter the weight you will use.
                      </p>
                      <div className="space-y-4">
                        <select
                          className="w-full p-2 border rounded"
                          value={calibrationSide}
                          onChange={(e) => setCalibrationSide(e.target.value)}
                        >
                          <option value="left">Left Side</option>
                          <option value="right">Right Side</option>
                        </select>
                        <input
                          type="number"
                          className="w-full p-2 border rounded"
                          placeholder="Weight in kg"
                          value={calibrationWeight}
                          onChange={(e) => setCalibrationWeight(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {calibrationStep === 1 && (
                    <div>
                      <h3 className="text-lg font-medium">Prepare for Calibration</h3>
                      <p className="text-sm text-gray-500">
                        1. Mount your bike on a trainer
                        <br />
                        2. Attach the {calibrationWeight}kg weight to the pedal
                        <br />
                        3. Position the crank arm parallel to the ground
                        <br />
                        4. Click Continue when ready
                      </p>
                    </div>
                  )}

                  {calibrationStep === 2 && (
                    <div>
                      <h3 className="text-lg font-medium">Calibrating...</h3>
                      <p className="text-sm text-gray-500">
                        Hold the position for 10 seconds.
                        <br />
                        Click Continue when complete.
                      </p>
                    </div>
                  )}

                  {calibrationStep === 3 && (
                    <div>
                      <h3 className="text-lg font-medium">Verify and Save</h3>
                      <p className="text-sm text-gray-500">
                        Calibration complete. Click Finish to save the calibration.
                      </p>
                    </div>
                  )}

                  <Button 
                    onClick={handleCalibration}
                    className="w-full"
                  >
                    {calibrationStep === 0 ? "Start" :
                     calibrationStep === 3 ? "Finish" : "Continue"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dev">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-6 h-6" />
                  Developer Console
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Log Display */}
                  <div className="h-64 overflow-y-auto bg-gray-100 p-2 rounded">
                    {logs.map((log, index) => (
                      <div key={index} className="text-sm">
                        <span className="text-gray-500">{log.time}</span>: {log.message}
                      </div>
                    ))}
                  </div>

                  {/* Custom Command Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Command"
                      className="flex-1 p-2 border rounded"
                      value={customCommand}
                      onChange={(e) => setCustomCommand(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Value (if needed)"
                      className="flex-1 p-2 border rounded"
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                    />
                    <Button 
                      onClick={() => handleCommandClick(customCommand, true)}
                      className="whitespace-nowrap"
                    >
                      Send Command
                    </Button>
                  </div>

                  {/* Command Groups */}
                  {Object.entries(commandGroups).map(([groupName, commands]) => (
                    <div key={groupName} className="space-y-2">
                      <h3 className="text-lg font-semibold capitalize">{groupName} Commands</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {commands.map((cmd) => (
                          <div key={cmd.cmd} className="space-y-1">
                            <Button 
                              onClick={() => handleCommandClick(cmd.cmd, !!cmd.param)}
                              className="w-full"
                            >
                              {cmd.cmd}
                            </Button>
                            <div className="text-xs text-gray-500">
                              {cmd.desc}
                              {cmd.param && <span className="block">Param: {cmd.param}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      )}
    </div>
  );
};

export default PowerMeterApp;
