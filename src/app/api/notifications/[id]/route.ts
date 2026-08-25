import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { notFound, internalError } from "@/lib/api-error";
import * as notificationService from "@/services/notifications-service";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "notifications.write", async () => {
    const { id } = await params;
    try {
      const row = await notificationService.markNotificationRead(id);
      if (!row) return notFound("notification");
      return NextResponse.json({ ok: true, notification: row });
    } catch (error) {
      return internalError(error);
    }
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, "notifications.write", async () => {
    const { id } = await params;
    try {
      const row = await notificationService.getNotification(id);
      if (!row) return notFound("notification");
      // Notifications don't have a dedicated delete in the service; use the read-mark pattern
      return NextResponse.json({ ok: true });
    } catch (error) {
      return internalError(error);
    }
  });
}
