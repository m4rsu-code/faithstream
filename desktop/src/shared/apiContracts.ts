export type ApiFormField =
  | { name: string; value: string }
  | { name: string; file: { data: Uint8Array; name: string; type: string } };

export type ApiRequestBody =
  | { kind: 'text'; value: string }
  | { kind: 'form'; fields: ApiFormField[] };

export type ApiRequestPayload = {
  path: string;
  method: string;
  headers: [string, string][];
  body?: ApiRequestBody;
};

export type ApiResponsePayload = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
};
