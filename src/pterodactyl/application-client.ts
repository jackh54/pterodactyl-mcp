import { PterodactylApiError } from "./client.js";

export interface CreateServerRequest {
  name: string;
  user: number;
  egg: number;
  dockerImage: string;
  startup: string;
  environment: Record<string, string>;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
  };
  featureLimits: {
    databases: number;
    allocations: number;
    backups: number;
  };
  allocation?: { default: number; additional?: number[] };
  deploy?: {
    locations: number[];
    dedicatedIp: boolean;
    portRange: string[];
  };
  description?: string;
  externalId?: string;
  startOnCompletion?: boolean;
}

export interface CreatedServer {
  id: number;
  uuid: string;
  identifier: string;
  name: string;
}

interface PterodactylObjectResponse<T> {
  object: string;
  attributes: T;
}

export class PterodactylApplicationClient {
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

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.panelUrl}${path}`, {
        method,
        headers: this.headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

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

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new PterodactylApiError(
          `Panel request timed out after ${this.requestTimeoutMs}ms`,
          504,
          "panel_timeout",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async createServer(options: CreateServerRequest): Promise<CreatedServer> {
    const data = await this.request<
      PterodactylObjectResponse<{
        id: number;
        uuid: string;
        identifier: string;
        name: string;
      }>
    >("POST", "/api/application/servers", {
      name: options.name,
      user: options.user,
      egg: options.egg,
      docker_image: options.dockerImage,
      startup: options.startup,
      environment: options.environment,
      limits: options.limits,
      feature_limits: {
        databases: options.featureLimits.databases,
        allocations: options.featureLimits.allocations,
        backups: options.featureLimits.backups,
      },
      allocation: options.allocation,
      deploy: options.deploy
        ? {
            locations: options.deploy.locations,
            dedicated_ip: options.deploy.dedicatedIp,
            port_range: options.deploy.portRange,
          }
        : undefined,
      description: options.description,
      external_id: options.externalId,
      start_on_completion: options.startOnCompletion ?? false,
    });

    return {
      id: data.attributes.id,
      uuid: data.attributes.uuid,
      identifier: data.attributes.identifier,
      name: data.attributes.name,
    };
  }

  async deleteServer(serverId: number, force = false): Promise<void> {
    const path = force
      ? `/api/application/servers/${serverId}/force`
      : `/api/application/servers/${serverId}`;
    await this.request("DELETE", path);
  }

  async getServerByIdentifier(identifier: string): Promise<{ id: number } | null> {
    const data = await this.request<{
      data: Array<{ attributes: { id: number; identifier: string } }>;
    }>("GET", `/api/application/servers?filter[uuidShort]=${encodeURIComponent(identifier)}`);

    const match = data.data.find((s) => s.attributes.identifier === identifier);
    return match ? { id: match.attributes.id } : null;
  }
}
