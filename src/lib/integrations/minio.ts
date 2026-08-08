import { AwsClient } from "aws4fetch";
import { integrationConfig } from "./index";

function getClient(): AwsClient {
  const { accessKey, secretKey, region } = integrationConfig.minio;
  if (!accessKey || !secretKey) throw new Error("MinIO credentials not configured");
  return new AwsClient({
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    region,
    service: "s3",
  });
}

export async function listBuckets(): Promise<string[]> {
  const cfg = integrationConfig.minio;
  if (!cfg.endpoint) throw new Error("MinIO endpoint not configured");
  const client = getClient();
  const res = await client.fetch(cfg.endpoint, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const names: string[] = [];
  const re = /<Name>([^<]+)<\/Name>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) names.push(match[1]);
  return names;
}

export async function generatePresignedUpload(
  key: string,
  contentType: string,
  expiresSec = 300
): Promise<{ uploadUrl: string; objectUrl: string }> {
  const cfg = integrationConfig.minio;
  if (!cfg.endpoint) throw new Error("MinIO endpoint not configured");
  const client = getClient();
  const url = `${cfg.endpoint}/${cfg.bucket}/${key}`;
  const signed = await client.sign(
    new Request(url, { method: "PUT", headers: { "content-type": contentType } }),
    { aws: { signQuery: true } }
  );
  const qp = `X-Amz-Expires=${expiresSec}`;
  return {
    uploadUrl: signed.url.includes("X-Amz-Expires=") ? signed.url : `${signed.url}&${qp}`,
    objectUrl: url,
  };
}

export async function ensureBucket(): Promise<boolean> {
  const cfg = integrationConfig.minio;
  const client = getClient();
  const url = `${cfg.endpoint}/${cfg.bucket}`;
  const head = await client.fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
  if (head.status === 404) {
    const put = await client.fetch(url, { method: "PUT", signal: AbortSignal.timeout(4000) });
    return put.ok;
  }
  return head.ok;
}
