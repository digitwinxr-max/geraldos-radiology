ALTER TABLE "event_log" ADD COLUMN "correlation_id" varchar(64);--> statement-breakpoint
ALTER TABLE "event_log" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "event_log" ADD COLUMN "publish_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_log" ADD COLUMN "last_publish_error" text;--> statement-breakpoint
CREATE INDEX "ai_observations_study_idx" ON "ai_observations" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "ai_observations_status_idx" ON "ai_observations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_recommendations_status_idx" ON "ai_recommendations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_recommendations_agent_idx" ON "ai_recommendations" USING btree ("agent");--> statement-breakpoint
CREATE INDEX "appointments_schedule_date_idx" ON "appointments" USING btree ("scheduled_date","scheduled_time");--> statement-breakpoint
CREATE INDEX "appointments_patient_idx" ON "appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "appointments_equipment_idx" ON "appointments" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "appointments_radiographer_idx" ON "appointments" USING btree ("radiographer_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "employee_records_staff_idx" ON "employee_records" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "employee_records_branch_idx" ON "employee_records" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "event_log_pending_idx" ON "event_log" USING btree ("id") WHERE published_at IS NULL;--> statement-breakpoint
CREATE INDEX "event_log_type_idx" ON "event_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "event_log_aggregate_idx" ON "event_log" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX "event_log_correlation_idx" ON "event_log" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "inventory_transactions_item_idx" ON "inventory_transactions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "invoices_patient_idx" ON "invoices" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_issue_date_idx" ON "invoices" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "maintenance_records_equipment_idx" ON "maintenance_records" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "referrals_patient_idx" ON "referrals" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "reports_study_idx" ON "reports" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "reports_patient_idx" ON "reports" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "study_annotations_study_idx" ON "study_annotations" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "study_bookmarks_user_idx" ON "study_bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_bookmarks_study_idx" ON "study_bookmarks" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "workflow_studies_stage_idx" ON "workflow_studies" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "workflow_studies_patient_idx" ON "workflow_studies" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "workflow_studies_radiologist_idx" ON "workflow_studies" USING btree ("radiologist_id");--> statement-breakpoint
CREATE INDEX "workflow_studies_uidx_study_instance" ON "workflow_studies" USING btree ("study_instance_uid");
--> statement-breakpoint
-- Backfill: historical events are considered already delivered. Without this,
-- the first boot after upgrade would fan the entire history out to Redis.
UPDATE "event_log" SET "published_at" = "occurred_at" WHERE "published_at" IS NULL;
