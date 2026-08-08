# Integration configurations and environment setups for GeraldOS approved stack
# This file defines how all external services connect and authenticate with each other.

import os
from minio import Minio
import httpx
from jose import jwt

class StackIntegrationManager:
    """
    Manages connections and health state across the approved GeraldOS system stack:
    - Keycloak (Authentication / RBAC)
    - Orthanc PACS (DICOMweb retrieval / Storage)
    - OHIF Viewer (Embedded config generation)
    - Dicoogle (DICOM metadata indexing & search)
    - HAPI FHIR (Clinical interoperability server)
    - n8n (Automation and clinical notification pipelines)
    - MinIO (Object storage backend)
    """
    
    def __init__(self):
        self.keycloak_url = os.getenv("KEYCLOAK_URL", "http://keycloak:8080/auth")
        self.keycloak_realm = os.getenv("KEYCLOAK_REALM", "GeraldOS")
        self.orthanc_url = os.getenv("ORTHANC_URL", "http://orthanc:8042")
        self.fhir_url = os.getenv("FHIR_URL", "http://fhir:8080/fhir")
        self.n8n_url = os.getenv("N8N_URL", "http://n8n:5678")
        self.dicoogle_url = os.getenv("DICOOGLE_URL", "http://dicoogle:8081")
        
        # MinIO client initialization
        self.minio_client = Minio(
            os.getenv("MINIO_ENDPOINT", "minio:9000"),
            access_key=os.getenv("MINIO_ACCESS_KEY", "minio_admin"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "minio_secure_pass"),
            secure=False
        )

    async def verify_keycloak_token(self, token: str) -> dict:
        """Validates incoming JWT tokens issued by Keycloak."""
        try:
            # Decode token header to discover key
            unverified_header = jwt.get_unverified_header(token)
            # Retrieve openid configuration from Keycloak
            async with httpx.AsyncClient() as client:
                certs_url = f"{self.keycloak_url}/realms/{self.keycloak_realm}/protocol/openid-connect/certs"
                response = await client.get(certs_url)
                jwks = response.json()
            
            # Real production decoder (Jose library handles JWKS mapping in complete version)
            payload = jwt.decode(
                token, 
                jwks, 
                algorithms=["RS256"], 
                audience="geraldos-front",
                issuer=f"{self.keycloak_url}/realms/{self.keycloak_realm}"
            )
            return payload
        except Exception as e:
            raise Exception(f"Token validation failed: {str(e)}")

    async def sync_pacs_to_fhir(self, patient_id: str, study_uid: str) -> bool:
        """
        Creates/Updates FHIR resources (DiagnosticReport, ImagingStudy)
        when a new DICOM study is successfully retrieved from Orthanc.
        """
        imaging_study_payload = {
            "resourceType": "ImagingStudy",
            "status": "available",
            "subject": {"reference": f"Patient/{patient_id}"},
            "identifier": [{
                "system": "urn:dicom:uid",
                "value": f"urn:oid:{study_uid}"
            }]
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.fhir_url}/ImagingStudy",
                    json=imaging_study_payload,
                    headers={"Content-Type": "application/fhir+json"}
                )
                return response.status_code in [200, 201]
        except Exception:
            return False

    async def trigger_n8n_notification(self, run_id: str, event: str, message: str) -> bool:
        """Triggers n8n automation workflow webhooks for notifications."""
        payload = {
            "run_id": run_id,
            "event": event,
            "message": message,
            "timestamp": "2026-08-04T12:00:00Z"
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.n8n_url}/webhook/clinical-workflow-transition",
                    json=payload
                )
                return response.status_code == 200
        except Exception:
            return False

    def upload_report_to_s3(self, report_id: str, content: bytes) -> str:
        """Persists draft reports/clinical summaries directly into MinIO S3 buckets."""
        bucket_name = "geraldos-reports"
        if not self.minio_client.bucket_exists(bucket_name):
            self.minio_client.make_bucket(bucket_name)
        
        from io import BytesIO
        stream = BytesIO(content)
        self.minio_client.put_object(
            bucket_name,
            f"{report_id}.txt",
            stream,
            length=len(content),
            content_type="text/plain"
        )
        return f"{bucket_name}/{report_id}.txt"
