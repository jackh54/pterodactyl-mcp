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
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "Application/vnd.pterodactyl.v1+json",
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.panelUrl}${path}`, {
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
      userPermissions: data.meta?.user_permissions ?? [],
      isServerOwner: data.meta?.is_server_owner ?? false,
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

  hasPermission(server: ServerDetails, permission: string): boolean {
    return server.userPermissions.includes(permission);
  }
}
