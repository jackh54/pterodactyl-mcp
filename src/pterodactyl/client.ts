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

export interface NetworkAllocation {
  id: number;
  ip: string;
  ipAlias: string | null;
  port: number;
  notes: string | null;
  isDefault: boolean;
}

export interface SubuserSummary {
  uuid: string;
  email: string;
  permissions: string[];
  createdAt: string;
}

export interface ServerDatabase {
  id: string;
  host: { address: string; port: number };
  name: string;
  username: string;
  connectionsFrom: string;
  maxConnections: number;
  password?: string;
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
      data?: { token?: string; socket?: string };
      attributes?: { token?: string; socket?: string };
    }>("GET", `/api/client/servers/${serverId}/websocket`);

    const token = data.data?.token ?? data.attributes?.token;
    const socket = data.data?.socket ?? data.attributes?.socket;

    if (!token || !socket) {
      throw new PterodactylApiError(
        "Panel returned invalid websocket credentials (missing token or socket URL)",
        502,
      );
    }

    return { token, socket };
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

  async getFileDownloadUrl(serverId: string, filePath: string): Promise<string> {
    const params = new URLSearchParams({ file: filePath });
    const data = await this.request<PterodactylObjectResponse<{ url: string }>>(
      "GET",
      `/api/client/servers/${serverId}/files/download?${params.toString()}`,
    );
    return data.attributes.url;
  }

  async getFileUploadUrl(serverId: string): Promise<string> {
    const data = await this.request<PterodactylObjectResponse<{ url: string }>>(
      "GET",
      `/api/client/servers/${serverId}/files/upload`,
    );
    return data.attributes.url;
  }

  async uploadFile(
    serverId: string,
    directory: string,
    filename: string,
    content: string | Uint8Array,
  ): Promise<void> {
    const uploadUrl = await this.getFileUploadUrl(serverId);
    const bytes =
      typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);
    const formData = new FormData();
    formData.append("files", new Blob([bytes.buffer]), filename);
    formData.append("directory", directory);

    const response = await this.fetchWithTimeout(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new PterodactylApiError(
        `File upload failed: ${response.statusText}`,
        response.status,
      );
    }
  }

  async downloadFileContent(
    serverId: string,
    filePath: string,
    maxBytes: number,
  ): Promise<{ content: string; byteLength: number; truncated: boolean; isBinary: boolean }> {
    const url = await this.getFileDownloadUrl(serverId, filePath);
    const response = await this.fetchWithTimeout(url, { method: "GET" });

    if (!response.ok) {
      throw new PterodactylApiError(
        `File download failed: ${response.statusText}`,
        response.status,
      );
    }

    const buffer = await response.arrayBuffer();
    const byteLength = buffer.byteLength;
    const slice = byteLength > maxBytes ? buffer.slice(0, maxBytes) : buffer;
    const bytes = new Uint8Array(slice);

    const isBinary = bytes.some((b) => b === 0 || (b < 32 && b !== 9 && b !== 10 && b !== 13));
    if (isBinary) {
      const base64 = Buffer.from(bytes).toString("base64");
      return {
        content: base64,
        byteLength,
        truncated: byteLength > maxBytes,
        isBinary: true,
      };
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });
    return {
      content: decoder.decode(bytes),
      byteLength,
      truncated: byteLength > maxBytes,
      isBinary: false,
    };
  }

  async createFolder(serverId: string, root: string, name: string): Promise<void> {
    await this.request("POST", `/api/client/servers/${serverId}/files/create-folder`, {
      root,
      name,
    });
  }

  async deleteFiles(serverId: string, root: string, files: string[]): Promise<void> {
    await this.request("POST", `/api/client/servers/${serverId}/files/delete`, {
      root,
      files,
    });
  }

  async renameFiles(
    serverId: string,
    root: string,
    operations: Array<{ from: string; to: string }>,
  ): Promise<void> {
    await this.request("PUT", `/api/client/servers/${serverId}/files/rename`, {
      root,
      files: operations,
    });
  }

  async pullRemoteFile(
    serverId: string,
    options: {
      url: string;
      directory: string;
      filename?: string;
      useHeader?: boolean;
      foreground?: boolean;
    },
  ): Promise<void> {
    await this.request("POST", `/api/client/servers/${serverId}/files/pull`, {
      url: options.url,
      directory: options.directory,
      filename: options.filename,
      use_header: options.useHeader ?? false,
      foreground: options.foreground ?? false,
    });
  }

  async restoreBackup(
    serverId: string,
    backupUuid: string,
    truncate = false,
  ): Promise<void> {
    await this.request(
      "POST",
      `/api/client/servers/${serverId}/backups/${backupUuid}/restore`,
      { truncate },
    );
  }

  async deleteBackup(serverId: string, backupUuid: string): Promise<void> {
    await this.request(
      "DELETE",
      `/api/client/servers/${serverId}/backups/${backupUuid}`,
    );
  }

  async getBackupDownloadUrl(serverId: string, backupUuid: string): Promise<string> {
    const data = await this.request<PterodactylObjectResponse<{ url: string }>>(
      "GET",
      `/api/client/servers/${serverId}/backups/${backupUuid}/download`,
    );
    return data.attributes.url;
  }

  async listAllocations(serverId: string): Promise<NetworkAllocation[]> {
    const data = await this.request<
      PterodactylListResponse<{
        id: number;
        ip: string;
        ip_alias: string | null;
        port: number;
        notes: string | null;
        is_default: boolean;
      }>
    >("GET", `/api/client/servers/${serverId}/network/allocations`);

    return data.data.map((item) => ({
      id: item.attributes.id,
      ip: item.attributes.ip,
      ipAlias: item.attributes.ip_alias,
      port: item.attributes.port,
      notes: item.attributes.notes,
      isDefault: item.attributes.is_default,
    }));
  }

  async createAllocation(serverId: string): Promise<NetworkAllocation> {
    const data = await this.request<
      PterodactylObjectResponse<{
        id: number;
        ip: string;
        ip_alias: string | null;
        port: number;
        notes: string | null;
        is_default: boolean;
      }>
    >("POST", `/api/client/servers/${serverId}/network/allocations`);

    return {
      id: data.attributes.id,
      ip: data.attributes.ip,
      ipAlias: data.attributes.ip_alias,
      port: data.attributes.port,
      notes: data.attributes.notes,
      isDefault: data.attributes.is_default,
    };
  }

  async updateAllocationNotes(
    serverId: string,
    allocationId: number,
    notes: string,
  ): Promise<NetworkAllocation> {
    const data = await this.request<
      PterodactylObjectResponse<{
        id: number;
        ip: string;
        ip_alias: string | null;
        port: number;
        notes: string | null;
        is_default: boolean;
      }>
    >(
      "POST",
      `/api/client/servers/${serverId}/network/allocations/${allocationId}`,
      { notes },
    );

    return {
      id: data.attributes.id,
      ip: data.attributes.ip,
      ipAlias: data.attributes.ip_alias,
      port: data.attributes.port,
      notes: data.attributes.notes,
      isDefault: data.attributes.is_default,
    };
  }

  async setPrimaryAllocation(
    serverId: string,
    allocationId: number,
  ): Promise<NetworkAllocation> {
    const data = await this.request<
      PterodactylObjectResponse<{
        id: number;
        ip: string;
        ip_alias: string | null;
        port: number;
        notes: string | null;
        is_default: boolean;
      }>
    >(
      "POST",
      `/api/client/servers/${serverId}/network/allocations/${allocationId}/primary`,
    );

    return {
      id: data.attributes.id,
      ip: data.attributes.ip,
      ipAlias: data.attributes.ip_alias,
      port: data.attributes.port,
      notes: data.attributes.notes,
      isDefault: data.attributes.is_default,
    };
  }

  async deleteAllocation(serverId: string, allocationId: number): Promise<void> {
    await this.request(
      "DELETE",
      `/api/client/servers/${serverId}/network/allocations/${allocationId}`,
    );
  }

  async listSubusers(serverId: string): Promise<SubuserSummary[]> {
    const data = await this.request<
      PterodactylListResponse<{
        uuid: string;
        email: string;
        permissions: string[];
        created_at: string;
      }>
    >("GET", `/api/client/servers/${serverId}/users`);

    return data.data.map((item) => ({
      uuid: item.attributes.uuid,
      email: item.attributes.email,
      permissions: item.attributes.permissions,
      createdAt: item.attributes.created_at,
    }));
  }

  async getSubuser(serverId: string, userUuid: string): Promise<SubuserSummary> {
    const data = await this.request<
      PterodactylObjectResponse<{
        uuid: string;
        email: string;
        permissions: string[];
        created_at: string;
      }>
    >("GET", `/api/client/servers/${serverId}/users/${userUuid}`);

    return {
      uuid: data.attributes.uuid,
      email: data.attributes.email,
      permissions: data.attributes.permissions,
      createdAt: data.attributes.created_at,
    };
  }

  async createSubuser(
    serverId: string,
    email: string,
    permissions: string[],
  ): Promise<SubuserSummary> {
    const data = await this.request<
      PterodactylObjectResponse<{
        uuid: string;
        email: string;
        permissions: string[];
        created_at: string;
      }>
    >("POST", `/api/client/servers/${serverId}/users`, { email, permissions });

    return {
      uuid: data.attributes.uuid,
      email: data.attributes.email,
      permissions: data.attributes.permissions,
      createdAt: data.attributes.created_at,
    };
  }

  async updateSubuser(
    serverId: string,
    userUuid: string,
    permissions: string[],
  ): Promise<SubuserSummary> {
    const data = await this.request<
      PterodactylObjectResponse<{
        uuid: string;
        email: string;
        permissions: string[];
        created_at: string;
      }>
    >("POST", `/api/client/servers/${serverId}/users/${userUuid}`, { permissions });

    return {
      uuid: data.attributes.uuid,
      email: data.attributes.email,
      permissions: data.attributes.permissions,
      createdAt: data.attributes.created_at,
    };
  }

  async deleteSubuser(serverId: string, userUuid: string): Promise<void> {
    await this.request("DELETE", `/api/client/servers/${serverId}/users/${userUuid}`);
  }

  async listDatabases(serverId: string): Promise<ServerDatabase[]> {
    const data = await this.request<
      PterodactylListResponse<{
        id: string;
        host: { address: string; port: number };
        name: string;
        username: string;
        connections_from: string;
        max_connections: number;
      }>
    >("GET", `/api/client/servers/${serverId}/databases`);

    return data.data.map((item) => ({
      id: item.attributes.id,
      host: item.attributes.host,
      name: item.attributes.name,
      username: item.attributes.username,
      connectionsFrom: item.attributes.connections_from,
      maxConnections: item.attributes.max_connections,
    }));
  }

  async createDatabase(
    serverId: string,
    database: string,
    remote = "%",
  ): Promise<ServerDatabase> {
    const data = await this.request<
      PterodactylObjectResponse<{
        id: string;
        host: { address: string; port: number };
        name: string;
        username: string;
        connections_from: string;
        max_connections: number;
        relationships?: {
          password?: { attributes?: { password?: string } };
        };
      }>
    >("POST", `/api/client/servers/${serverId}/databases`, {
      database,
      remote,
    });

    return {
      id: data.attributes.id,
      host: data.attributes.host,
      name: data.attributes.name,
      username: data.attributes.username,
      connectionsFrom: data.attributes.connections_from,
      maxConnections: data.attributes.max_connections,
      password: data.attributes.relationships?.password?.attributes?.password,
    };
  }

  async rotateDatabasePassword(serverId: string, databaseId: string): Promise<ServerDatabase> {
    const data = await this.request<
      PterodactylObjectResponse<{
        id: string;
        host: { address: string; port: number };
        name: string;
        username: string;
        connections_from: string;
        max_connections: number;
        relationships?: {
          password?: { attributes?: { password?: string } };
        };
      }>
    >(
      "POST",
      `/api/client/servers/${serverId}/databases/${databaseId}/rotate-password`,
    );

    return {
      id: data.attributes.id,
      host: data.attributes.host,
      name: data.attributes.name,
      username: data.attributes.username,
      connectionsFrom: data.attributes.connections_from,
      maxConnections: data.attributes.max_connections,
      password: data.attributes.relationships?.password?.attributes?.password,
    };
  }

  async deleteDatabase(serverId: string, databaseId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/api/client/servers/${serverId}/databases/${databaseId}`,
    );
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
