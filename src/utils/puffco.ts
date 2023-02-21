import { createHash } from "crypto";
import { EventEmitter } from "events";
import { convertFromHex, convertHexStringToNumArray, decimalToHexString, flipHexString, gattPoller, getValue, hexToFloat } from "./functions";

export const SERVICE = '06caf9c0-74d3-454f-9be9-e30cd999c17a';
export const MODEL_INFORMATION = '00002a24-0000-1000-8000-00805f9b34fb';
export const BASE_CHARACTERISTIC = `f9a98c15-c651-4f34-b656-d100bf5800`;
export const HANDSHAKE_KEY = Buffer.from("FUrZc0WilhUBteT2JlCc+A==", "base64");

export let service: BluetoothRemoteGATTService;
export let device: BluetoothDevice;
export let server: BluetoothRemoteGATTServer;
export let poller: EventEmitter;

export const decoder = new TextDecoder('utf-8');

export const Characteristic = {
  ACCESS_KEY: `${BASE_CHARACTERISTIC}e0`,
  COMMAND: `${BASE_CHARACTERISTIC}40`,
  BATTERY_SOC: `${BASE_CHARACTERISTIC}20`,
  BATTERY_VOLTAGE: `${BASE_CHARACTERISTIC}21`,
  OPERATING_STATE: `${BASE_CHARACTERISTIC}22`,
  STATE_ELAPSED_TIME: `${BASE_CHARACTERISTIC}23`,
  STATE_TOTAL_TIME: `${BASE_CHARACTERISTIC}24`,
  HEATER_TEMP: `${BASE_CHARACTERISTIC}25`,
  ACTIVE_LED_COLOR: `${BASE_CHARACTERISTIC}27`,
  HEATER_POWER: `${BASE_CHARACTERISTIC}28`,
  HEATER_DUTY: `${BASE_CHARACTERISTIC}29`,
  HEATER_VOLTAGE: `${BASE_CHARACTERISTIC}2a`,
  HEATER_CURRENT: `${BASE_CHARACTERISTIC}2b`,
  SAFETY_THERMAL_EST_TEMP: `${BASE_CHARACTERISTIC}2c`,
  HEATER_RESISTANCE: `${BASE_CHARACTERISTIC}2d`,
  BATTERY_CHARGE_CURRENT: `${BASE_CHARACTERISTIC}2e`,
  TOTAL_HEAT_CYCLES: `${BASE_CHARACTERISTIC}2f`,
  TOTAL_HEAT_CYCLE_TIME: `${BASE_CHARACTERISTIC}30`,
  BATTERY_CHARGE_STATE: `${BASE_CHARACTERISTIC}31`,
  BATTER_CHARGE_ELAPSED_TIME: `${BASE_CHARACTERISTIC}32`,
  BATTER_CHARGE_EST_TIME_TO_FULL: `${BASE_CHARACTERISTIC}33`,
  BATTERY_TEMP: `${BASE_CHARACTERISTIC}34`,
  UPTIME: `${BASE_CHARACTERISTIC}35`,
  INPUT_CURRENT: `${BASE_CHARACTERISTIC}37`,
  BATTERY_CAPACITY: `${BASE_CHARACTERISTIC}38`,
  BATTERY_CURRENT: `${BASE_CHARACTERISTIC}39`,
  APPROX_DABS_REMAINING: `${BASE_CHARACTERISTIC}3a`,
  DABS_PER_DAY: `${BASE_CHARACTERISTIC}3b`,
  RAW_HEATER_TEMP: `${BASE_CHARACTERISTIC}3c`,
  RAW_HEATER_TEMP_COMMAND: `${BASE_CHARACTERISTIC}3d`,
  BATTERY_CHARGE_SOURCE: `${BASE_CHARACTERISTIC}3e`,
  CHAMBER_TYPE: `${BASE_CHARACTERISTIC}3f`,
  MODE_COMMAND: `${BASE_CHARACTERISTIC}40`,
  STEALTH_MODE: `${BASE_CHARACTERISTIC}42`,
  TEMPERATURE_OVERRIDE: `${BASE_CHARACTERISTIC}45`,
  LANTERN_COLOR: `${BASE_CHARACTERISTIC}48`,
  PROFILE_NAME: `${BASE_CHARACTERISTIC}62`,
  PROFILE_COLOR: `${BASE_CHARACTERISTIC}65`,
  LED_BRIGHTNESS: `${BASE_CHARACTERISTIC}4b`,
  DEVICE_NAME: `${BASE_CHARACTERISTIC}4d`,
  DEVICE_BIRTHDAY: `${BASE_CHARACTERISTIC}4e`,
  TRIP_HEAT_CYCLES: `${BASE_CHARACTERISTIC}51`,
  TRIP_HEAT_CYCLE_TIME: `${BASE_CHARACTERISTIC}52`,
  HEAT_CYCLE_COUNT: `${BASE_CHARACTERISTIC}60`,
};

export const DeviceCommand = {
  IDLE: new Uint8Array([0, 0, 0, 64]),
  SHOW_VERSION: new Uint8Array([0, 0, 192, 64]),
  TEMP_SELECT_BEGIN: new Uint8Array([0, 0, 64, 64]),
  HEAT_CYCLE_BEGIN: new Uint8Array([0, 0, 224, 64])
};

export enum ChargeSource {
  USB,
  Wireless,
  None = 3
}

export async function startConnection() {
  try {
    try {
      device = await navigator.bluetooth.requestDevice({

        filters: [
          {
            services: [SERVICE],
          },
        ],
      });
    } catch (error) {
      throw error;
    }

    server = await device.gatt.connect();
    service = await server.getPrimaryService(
      SERVICE
    );

    const accessSeedKey = await service.getCharacteristic(Characteristic.ACCESS_KEY);
    const value = await accessSeedKey.readValue();

    const decodedKey = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      decodedKey[i] = value.getUint8(i);
    }

    const decodedHandshake = convertFromHex(HANDSHAKE_KEY.toString('hex'));

    const newSeed = new Uint8Array(32);
    for (let i = 0; i < 16; ++i) {
      newSeed[i] = decodedHandshake.charCodeAt(i);
      newSeed[i + 16] = decodedKey[i];
    }

    const newKey = convertHexStringToNumArray(createHash('sha256').update(newSeed).digest('hex')).slice(0, 16);
    await accessSeedKey.writeValue(Buffer.from(newKey));

    return device;
  } catch (error) {
    throw error;
  }
}

export async function disconnectBluetooth() {
  if (!server || !poller) return;
  poller.emit('stop');
  server.disconnect();
}

export async function sendCommand(command: Uint8Array) {
  if (!service) return;

  const char = await service.getCharacteristic(Characteristic.COMMAND);
  await char.writeValue(Buffer.from(command));
}

export async function startPolling() {
  poller = new EventEmitter();
  if (!service) return;

  const chargingPoll = await gattPoller(service, Characteristic.BATTERY_CHARGE_SOURCE, 5000);
  chargingPoll.on('change', (data, raw) => {
    poller.emit('data', { chargeSource: Number(hexToFloat(data).toFixed(0)) });
  });

  const batteryPoll = await gattPoller(service, Characteristic.BATTERY_SOC);
  batteryPoll.on('change', (data, raw) => {
    poller.emit('data', { battery: Number(hexToFloat(data).toFixed(0)) });
  });

  const operatingState = await gattPoller(service, Characteristic.OPERATING_STATE, 1000);
  operatingState.on('change', (data) => {
    poller.emit('data', { state: hexToFloat(data) });
  });

  const aciveLEDPoll = await gattPoller(service, Characteristic.ACTIVE_LED_COLOR, 1000);
  let currentLedColor: { r: number; g: number; b: number };
  aciveLEDPoll.on('data', (data, raw: Buffer) => {
    const r = (raw as any).getUint8(0);
    const g = (raw as any).getUint8(1);
    const b = (raw as any).getUint8(2);
    if (JSON.stringify(currentLedColor) != JSON.stringify({ r, g, b })) poller.emit('data', { activeColor: { r, g, b } });
    currentLedColor = { r, g, b };
  });

  const totalDabsPoll = await gattPoller(service, Characteristic.TOTAL_HEAT_CYCLES);
  totalDabsPoll.on('data', (data, raw) => {
    const dabsString = decimalToHexString(raw.getUint8(0)).toString() + decimalToHexString(raw.getUint8(1)).toString() + decimalToHexString(raw.getUint8(2)).toString() + decimalToHexString(raw.getUint8(3)).toString();
    const float = hexToFloat(flipHexString('0x' + dabsString, 8));
    poller.emit('data', { totalDabs: float });
  });

  let lastTemp: number;
  const tempPoll = await gattPoller(service, Characteristic.HEATER_TEMP, 1000);
  tempPoll.on('data', async (data) => {
    const conv = Number(hexToFloat(data).toFixed(0));
    if (lastTemp != conv && conv < 1000 && conv > 1) poller.emit('data', { temperature: conv });
    lastTemp = conv;
  });

  const profileNamePoll = await gattPoller(service, Characteristic.PROFILE_NAME);
  profileNamePoll.on('change', (data, raw) => {
    const name = decoder.decode(raw);
    poller.emit('data', { profileName: name });
  });

  const deviceNamePoll = await gattPoller(service, Characteristic.DEVICE_NAME);
  deviceNamePoll.on('change', (data, raw) => {
    const name = decoder.decode(raw);
    poller.emit('data', { deviceName: name });
  });

  poller.on('stop', () => {
    chargingPoll.emit('stop');
    batteryPoll.emit('stop');
    operatingState.emit('stop');
    aciveLEDPoll.emit('stop');
    totalDabsPoll.emit('stop');
    tempPoll.emit('stop');
    profileNamePoll.emit('stop');
    deviceNamePoll.emit('stop');
    poller.removeAllListeners();
  });

  return poller;
}