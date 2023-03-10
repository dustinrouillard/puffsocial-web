import { EventEmitter } from "events";
import { inflate, deflate } from "pako";
import { APIGroup } from "../types/api";
import { GatewayError, GatewayGroup, GatewayGroupCreate, GatewayGroupDelete, GroupActionInitiator, GroupReaction, GroupUserDeviceDisconnect, GroupUserDeviceUpdate, GroupUserJoin, GroupUserLeft, GroupUserUpdate } from "../types/gateway";

export enum Op {
  Hello,
  Join,
  CreateGroup,
  Event,
  SendDeviceState,
  UpdateGroup,
  UpdateUser,
  LeaveGroup,
  InquireHeating,
  StartWithReady,
  DisconnectDevice,
  SendMessage,
  StopAwaiting,
  ResumeSession,
  SendReaction,
  DeleteGroup,
  Heartbeat = 420
}

enum Event {
  JoinedGroup = 'JOINED_GROUP',
  GroupCreate = 'GROUP_CREATE',
  GroupDelete = 'GROUP_DELETE',
  GroupUpdate = 'GROUP_UPDATE',
  GroupUserJoin = 'GROUP_USER_JOIN',
  GroupUserLeft = 'GROUP_USER_LEFT',
  GroupUserUpdate = 'GROUP_USER_UPDATE',
  GroupUserDeviceUpdate = 'GROUP_USER_DEVICE_UPDATE',
  GroupJoinError = 'GROUP_JOIN_ERROR',
  GroupHeatBegin = "GROUP_START_HEATING",
  GroupHeatInquiry = "GROUP_HEAT_INQUIRY",
  GroupUserReady = "GROUP_USER_READY",
  GroupUserUnready = "GROUP_USER_UNREADY",
  GroupActionError = "GROUP_ACTION_ERROR",
  GroupVisibilityChange = "GROUP_VISIBILITY_CHANGE",
  PublicGroupsUpdate = "PUBLIC_GROUPS_UPDATE",
  GroupCreateError = "GROUP_CREATE_ERROR",
  UserUpdateError = "USER_UPDATE_ERROR",
  GroupUserDeviceDisconnect = "GROUP_USER_DEVICE_DISCONNECT",
  GroupReaction = "GROUP_REACTION",
  GroupMessage = "GROUP_MESSAGE",
  SessionResumed = "SESSION_RESUMED"
}

interface SocketData {
  session_id?: string;
  session_token?: string;
  heartbeat_interval?: number;
}

interface SocketMessage {
  op: Op;
  t?: Event;
  d?: SocketData | { [key: string]: any };
}

export interface Gateway {
  ws: WebSocket;
  heartbeat: NodeJS.Timer;

  session_id: string;
  session_token: string;

  connectionAttempt: number;
  connectionTimeout: NodeJS.Timeout | null;

  url: string;
  encoding: string; // 'etf' | 'json'
  compression: string; // 'zlib' | 'none'

  on(event: "connected", listener: () => void): this;
  on(event: "hello", listener: () => void): this;
  on(event: "joined_group", listener: (group: GatewayGroup) => void): this;
  on(event: "group_join_error", listener: (error: GatewayError) => void): this;
  on(event: "group_visibility_change", listener: (action: GroupActionInitiator & { visibility: string }) => void): this;
  on(event: "group_user_join", listener: (group: GroupUserJoin) => void): this;
  on(event: "group_user_left", listener: (group: GroupUserLeft) => void): this;
  on(event: "group_create", listener: (group: GatewayGroupCreate) => void): this;
  on(event: "group_update", listener: (group: GatewayGroup) => void): this;
  on(event: "group_delete", listener: (group: GatewayGroupDelete) => void): this;
  on(event: "group_user_update", listener: (group: GroupUserUpdate) => void): this;
  on(event: "group_user_device_update", listener: (group: GroupUserDeviceUpdate) => void): this;
  on(event: "group_user_device_disconnect", listener: (group: GroupUserDeviceDisconnect) => void): this;
  on(event: "group_action_error", listener: (error: GatewayError) => void): this;
  on(event: "group_heat_inquiry", listener: (group: GroupActionInitiator) => void): this;
  on(event: "group_heat_begin", listener: () => void): this;
  on(event: "group_user_ready", listener: (action: GroupActionInitiator) => void): this;
  on(event: "group_user_unready", listener: (action: GroupActionInitiator) => void): this;
  on(event: "public_groups_update", listener: (groups: APIGroup[]) => void): this;
  on(event: "group_create_error", listener: (error: GatewayError) => void): this;
  on(event: "group_message", listener: (message: any) => void): this;
  on(event: "group_reaction", listener: (reaction: GroupReaction) => void): this;
  on(event: "user_update_error", listener: (error: GatewayError) => void): this;
}
export class Gateway extends EventEmitter {
  constructor(
    url = "wss://rosin.puff.social",
    encoding = "json",
    compression = "zlib"
  ) {
    super();

    this.compression = compression;
    this.encoding = encoding;
    this.url = url;

    this.connectionAttempt = 0;

    this.init();
  }

  private init(): void {
    this.ws = new WebSocket(
      `${this.url}/socket?encoding=${this.encoding}&compression=${this.compression}`
    );
    if (this.compression != "none") this.ws.binaryType = "arraybuffer";

    // Socket open handler
    this.ws.addEventListener("open", () => this.opened());

    // Message listener
    this.ws.addEventListener("message", (e) => {
      const message =
        this.compression != "none"
          ? JSON.parse(inflate(e.data, { to: "string" }))
          : JSON.parse(e.data);

      try {
        this.message(message);
      } catch (error) { }
    });

    // Close event for websocket
    this.ws.addEventListener("close", () => this.closed());
  }

  private resetConnectionThrottle(): void {
    this.connectionAttempt = 0;
    if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
  }

  private reconnectThrottle(): void {
    this.connectionAttempt++;
    this.connectionTimeout = setTimeout(
      () => this.init(),
      this.connectionAttempt == 1
        ? 1000 * 3
        : this.connectionAttempt == 2
          ? 1000 * 10
          : this.connectionAttempt == 3
            ? 1000 * 30 * 1
            : 1000 * 30 * 5
    );
  }

  send(op: Op, d?: any): void {
    if (this.ws.readyState != this.ws.OPEN) return;
    const data =
      this.compression != "none"
        ? deflate(JSON.stringify({ op, d }))
        : JSON.stringify({ op, d });
    return this.ws.send(data);
  }

  private sendHeartbeat(): void {
    return this.send(Op.Heartbeat);
  }

  private message(data: SocketMessage): void {
    switch (data.op) {
      case Op.Hello:
        this.heartbeat = setInterval(
          () => this.sendHeartbeat(),
          data.d.heartbeat_interval
        );

        if (typeof localStorage != 'undefined')
          this.send(Op.UpdateUser, { name: localStorage.getItem('puff-social-name') || 'Unnamed' });

        if (this.session_token && this.session_id)
          this.send(Op.ResumeSession, { session_id: this.session_id, session_token: this.session_token });
        else {
          this.session_id = data.d.session_id;
          this.session_token = data.d.session_token;
        }

        this.emit("init");

        break;

      case Op.Event:
        switch (data.t) {
          case Event.JoinedGroup: {
            this.emit('joined_group', data.d);
            break;
          }
          case Event.GroupCreate: {
            this.emit('group_create', data.d);
            break;
          }
          case Event.GroupDelete: {
            this.emit('group_delete', data.d);
            break;
          }
          case Event.GroupUpdate: {
            this.emit('group_update', data.d);
            break;
          }
          case Event.GroupUserJoin: {
            this.emit('group_user_join', data.d);
            break;
          }
          case Event.GroupUserLeft: {
            this.emit('group_user_left', data.d);
            break;
          }
          case Event.GroupUserUpdate: {
            this.emit('group_user_update', data.d);
            break;
          }
          case Event.GroupUserDeviceUpdate: {
            this.emit('group_user_device_update', data.d);
            break;
          }
          case Event.GroupHeatInquiry: {
            this.emit('group_heat_inquiry', data.d);
            break;
          }
          case Event.GroupHeatBegin: {
            this.emit('group_heat_begin');
            break;
          }
          case Event.GroupUserReady: {
            this.emit('group_user_ready', data.d);
            break;
          }
          case Event.GroupJoinError: {
            this.emit('group_join_error', data.d);
            break;
          }
          case Event.GroupVisibilityChange: {
            this.emit('group_visibility_change', data.d);
            break;
          }
          case Event.PublicGroupsUpdate: {
            this.emit('public_groups_update', data.d);
            break;
          }
          case Event.GroupActionError: {
            this.emit('group_action_error', data.d);
            break;
          }
          case Event.GroupCreateError: {
            this.emit('group_create_error', data.d);
            break;
          }
          case Event.UserUpdateError: {
            this.emit('user_update_error', data.d);
            break;
          }
          case Event.GroupUserDeviceDisconnect: {
            this.emit('group_user_device_disconnect', data.d);
            break;
          }
          case Event.GroupUserUnready: {
            this.emit('group_user_unready', data.d);
            break;
          }
          case Event.GroupMessage: {
            this.emit('group_message', data.d);
            break;
          }
          case Event.GroupReaction: {
            this.emit('group_reaction', data.d);
            break;
          }
          case Event.SessionResumed: {
            this.session_id = data.d.session_id;
            this.emit('session_resumed', data.d);
            break;
          }
        }

        break;

      default:
        break;
    }
  }

  private opened(): void {
    console.log(
      `%c${SOCKET_URL.includes('puff.social') ? SOCKET_URL.split('.')[0].split('//')[1] : 'Local'}%c Socket connection opened`,
      "padding: 10px; text-transform: capitalize; font-size: 1em; line-height: 1.4em; color: white; background: #151515; border-radius: 15px;",
      "font-size: 1em;"
    );
    this.emit("connected");
    this.resetConnectionThrottle();
  }

  private closed(): void {
    console.log(
      `%c${SOCKET_URL.includes('puff.social') ? SOCKET_URL.split('.')[0].split('//')[1] : 'Local'}%c Socket connection closed`,
      "padding: 10px; text-transform: capitalize; font-size: 1em; line-height: 1.4em; color: white; background: #151515; border-radius: 15px;",
      "font-size: 1em;"
    );
    clearInterval(this.heartbeat);
    this.reconnectThrottle();
  }
}

export const SOCKET_URL = typeof location != 'undefined' && ['localhost', 'dev.puff.social'].includes(location.hostname) ? (location.hostname == 'dev.puff.social' ? 'wss://flower.puff.social' : 'ws://127.0.0.1:9000') : 'wss://rosin.puff.social';
export const gateway = typeof window != "undefined" && (['ws://127.0.0.1:9000', 'wss://flower.puff.social'].includes(SOCKET_URL) || ['stage.puff.social'].includes(location.hostname) ? new Gateway(SOCKET_URL, 'json', 'none') : new Gateway(SOCKET_URL));