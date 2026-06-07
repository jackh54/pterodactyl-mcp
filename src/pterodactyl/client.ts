export class PterodactylApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "PterodactylApiError";
  }
}

export interface AccountInfo {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

export interface ServerSummary {
  identifier: string;
  uuid: string;
  name: string;
  description: string;
  node: string;
  status: string | null;
  isSuspended: boolean;
  isInstalling: boolean;
}

export interface ServerDetails extends ServerSummary {
  internalId: number;
  invocation: string;
  dockerImage: string;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
  };
  userPermissions: string[];
  isServerOwner: boolean;
}

export interface ServerResources {
  currentState: string;
  isSuspended: boolean;
  memoryBytes: number;
  cpuAbsolute: number;
  diskBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptime: number;
}

export type PowerSignal = "start" | "stop" | "restart" | "kill";

export interface FileEntry {
  name: string;
  mode: string;
  size: number;
  isFile: boolean;
  isSymlink: boolean;
  mime: string | null;
  modifiedAt: string;
}

export interface ActivityEntry {
  id: string;
  event: string;
  description: string;
  ip: string | null;
  timestamp: string;
  properties: Record<string, unknown>;
}

export interface BackupSummary {
  uuid: string;
  name: string;
  isSuccessful: boolean | null;
  isLocked: boolean;
  bytes: number;
  createdAt: string;
  completedAt: string | null;
}

interface PterodactylListResponse<T> {
  object: string;
  data: Array<{ object: string; attributes: T }>;
}

interface PterodactylObjectResponse<T> {
  object: string;
  attributes: T;
  meta?: Record<string, unknown>;
}

export class PterodactylClient {
  constructor(
    private readonly panelUrl: string,
    private readonly apiKey: string,
    private readonly requestTimeoutMs = 30_000,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "Application/vnd.pterodactyl.v1+json",
      "Content-Type": "application/json",
    };
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new PterodactylApiError(
          `Panel request timed out after ${this.requestTimeoutMs}ms (${url})`,
          504,
          "panel_timeout",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestText(path: string): Promise<string> {
    const response = await this.fetchWithTimeout(`${this.panelUrl}${path}`, {
      method: "GET",
      headers: this.headers(),
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errorBody = (await response.json()) as {
          errors?: Array<{ detail?: string }>;
        };
        detail = errorBody.errors?.[0]?.detail ?? detail;
      } catch {
        // ignore parse errors
      }
      throw new PterodactylApiError(detail, response.status);
    }

    return response.text();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetchWithTimeout(`${this.panelUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let detail = response.statusText;
      let code: string | undefined;
      try {
        const errorBody = (await response.json()) as {
          errors?: Array<{ detail?: string; code?: string }>;
        };
        const first = errorBody.errors?.[0];
        detail = first?.detail ?? detail;
        code = first?.code;
      } catch {
        // ignore parse errors
      }
      throw new PterodactylApiError(detail, response.status, code);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async validateAccount(): Promise<AccountInfo> {
    const data = await this.request<PterodactylObjectResponse<{
      id: number;
      email: string;
      first_name: string;
      last_name: string;
    }>>("GET", "/api/client/account");

    return {
      id: data.attributes.id,
      email: data.attributes.email,
      firstName: data.attributes.first_name,
      lastName: data.attributes.last_name,
    };
  }

  async listServers(): Promise<ServerSummary[]> {
    const data = await this.request<
      PterodactylListResponse<{
        identifier: string;
        uuid: string;
        name: string;
        description: string;
        node: string;
        status: string | null;
        is_suspended: boolean;
        is_installing: boolean;
      }>
    >("GET", "/api/client");

    return data.data.map((item) => ({
      identifier: item.attributes.identifier,
      uuid: item.attributes.uuid,
      name: item.attributes.name,
      description: item.attributes.description,
      node: item.attributes.node,
      status: item.attributes.status,
      isSuspended: item.attributes.is_suspended,
      isInstalling: item.attributes.is_installing,
    }));
  }

  async getServer(serverId: string): Promise<ServerDetails> {
    const data = await this.request<
      PterodactylObjectResponse<{
        identifier: string;
        uuid: string;
        internal_id: number;
        name: string;
        description: string;
        node: string;
        status: string | null;
        is_suspended: boolean;
        is_installing: boolean;
        invocation: string;
        docker_image: string;
        limits: {
          memory: number;
          swap: number;
          disk: number;
          io: number;
          cpu: number;
        };
        server_owner?: boolean;
        user_permissions?: string[];
      }> & {
        meta?: {
          is_server_owner?: boolean;
          user_permissions?: string[];
        };
      }
    >("GET", `/api/client/servers/${serverId}`);

    return {
      identifier: data.attributes.identifier,
      uuid: data.attributes.uuid,
      internalId: data.attributes.internal_id,
      name: data.attributes.name,
      description: data.attributes.description,
      node: data.attributes.node,
      status: data.attributes.status,
      isSuspended: data.attributes.is_suspended,
      isInstalling: data.attributes.is_installing,
      invocation: data.attributes.invocation,
      dockerImage: data.attributes.docker_image,
      limits: data.attributes.limits,
      userPermissions:
        data.meta?.user_permissions ??
        data.attributes.user_permissions ??
        [],
      isServerOwner:
        data.meta?.is_server_owner ??
        data.attributes.server_owner ??
        false,
    };
  }

  async getServerResources(serverId: string): Promise<ServerResources> {
    const data = await this.request<
      PterodactylObjectResponse<{
        current_state: string;
        is_suspended: boolean;
        resources: {
          memory_bytes: number;
          cpu_absolute: number;
          disk_bytes: number;
          network_rx_bytes: number;
          network_tx_bytes: number;
          uptime: number;
        };
      }>
    >("GET", `/api/client/servers/${serverId}/resources`);

    return {
      currentState: data.attributes.current_state,
      isSuspended: data.attributes.is_suspended,
      memoryBytes: data.attributes.resources.memory_bytes,
      cpuAbsolute: data.attributes.resources.cpu_absolute,
      diskBytes: data.attributes.resources.disk_bytes,
      networkRxBytes: data.attributes.resources.network_rx_bytes,
      networkTxBytes: data.attributes.resources.network_tx_bytes,
      uptime: data.attributes.resources.uptime,
    };
  }

  async sendCommand(serverId: string, command: string): Promise<void> {
    await this.request("POST", `/api/client/servers/${serverId}/command`, {
      command,
    });
  }

  async getWebSocketCredentials(serverId: string): Promise<{ token: string; socket: string }> {
    const data = await this.request<{
      data: { token: string; socket: string };
    }>("GET", `/api/client/servers/${serverId}/websocket`);

    return {
      token: data.data.token,
      socket: data.data.socket,
    };
  }

  async sendPowerAction(serverId: string, signal: PowerSignal): Promise<void> {
    await this.request("POST", `/api/client/servers/${serverId}/power`, {
      signal,
    });
  }

  async listFiles(serverId: string, directory: string): Promise<FileEntry[]> {
    const params = new URLSearchParams({ directory });
    const data = await this.request<
      PterodactylListResponse<{
        name: string;
        mode: string;
        size: number;
        is_file: boolean;
        is_symlink: boolean;
        mimetype: string | null;
        modified_at: string;
      }>
    >("GET", `/api/client/servers/${serverId}/files/list?${params.toString()}`);

    return data.data.map((item) => ({
      name: item.attributes.name,
      mode: item.attributes.mode,
      size: item.attributes.size,
      isFile: item.attributes.is_file,
      isSymlink: item.attributes.is_symlink,
      mime: item.attributes.mimetype,
      modifiedAt: item.attributes.modified_at,
    }));
  }

  async readFile(serverId: string, filePath: string): Promise<string> {
    const params = new URLSearchParams({ file: filePath });
    return this.requestText(
      `/api/client/servers/${serverId}/files/contents?${params.toString()}`,
    );
  }

  async writeFile(serverId: string, filePath: string, content: string): Promise<void> {
    const params = new URLSearchParams({ file: filePath });
    const response = await fetch(
      `${this.panelUrl}/api/client/servers/${serverId}/files/write?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "Application/vnd.pterodactyl.v1+json",
          "Content-Type": "text/plain",
        },
        body: content,
      },
    );

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errorBody = (await response.json()) as {
          errors?: Array<{ detail?: string }>;
        };
        detail = errorBody.errors?.[0]?.detail ?? detail;
      } catch {
        // ignore
      }
      throw new PterodactylApiError(detail, response.status);
    }
  }

  async listBackups(serverId: string): Promise<BackupSummary[]> {
    const data = await this.request<
      PterodactylListResponse<{
        uuid: string;
        name: string;
        is_successful: boolean | null;
        is_locked: boolean;
        bytes: number;
        created_at: string;
        completed_at: string | null;
      }>
    >("GET", `/api/client/servers/${serverId}/backups`);

    return data.data.map((item) => ({
      uuid: item.attributes.uuid,
      name: item.attributes.name,
      isSuccessful: item.attributes.is_successful,
      isLocked: item.attributes.is_locked,
      bytes: item.attributes.bytes,
      createdAt: item.attributes.created_at,
      completedAt: item.attributes.completed_at,
    }));
  }

  async createBackup(
    serverId: string,
    options: { name?: string; ignored?: string; isLocked?: boolean } = {},
  ): Promise<BackupSummary> {
    const data = await this.request<
      PterodactylObjectResponse<{
        uuid: string;
        name: string;
        is_successful: boolean | null;
        is_locked: boolean;
        bytes: number;
        created_at: string;
        completed_at: string | null;
      }>
    >("POST", `/api/client/servers/${serverId}/backups`, {
      name: options.name,
      ignored: options.ignored,
      is_locked: options.isLocked ?? false,
    });

    return {
      uuid: data.attributes.uuid,
      name: data.attributes.name,
      isSuccessful: data.attributes.is_successful,
      isLocked: data.attributes.is_locked,
      bytes: data.attributes.bytes,
      createdAt: data.attributes.created_at,
      completedAt: data.attributes.completed_at,
    };
  }

  async getServerActivity(
    serverId: string,
    page = 1,
    perPage = 25,
  ): Promise<ActivityEntry[]> {
    const params = new URLSearchParams({
      page: String(page),
      "per_page": String(Math.min(perPage, 100)),
    });
    const data = await this.request<
      PterodactylListResponse<{
        id: string;
        event: string;
        description: string;
        ip: string | null;
        timestamp: string;
        properties: Record<string, unknown>;
      }>
    >("GET", `/api/client/servers/${serverId}/activity?${params.toString()}`);

    return data.data.map((item) => ({
      id: item.attributes.id,
      event: item.attributes.event,
      description: item.attributes.description,
      ip: item.attributes.ip,
      timestamp: item.attributes.timestamp,
      properties: item.attributes.properties,
    }));
  }

  hasPermission(server: ServerDetails, permission: string): boolean {
    if (server.isServerOwner) {
      return true;
    }
    if (server.userPermissions.includes("*")) {
      return true;
    }
    return server.userPermissions.includes(permission);
  }
}
