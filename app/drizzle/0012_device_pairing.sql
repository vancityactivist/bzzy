CREATE TABLE "device_pairing" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"secret_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"board" text,
	"firmware_version" text,
	"expires_at" timestamp NOT NULL,
	"device_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "device_pairing_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "device_pairing" ADD CONSTRAINT "device_pairing_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_pairing_ip_idx" ON "device_pairing" USING btree ("ip_hash");--> statement-breakpoint
CREATE INDEX "device_pairing_expires_idx" ON "device_pairing" USING btree ("expires_at");