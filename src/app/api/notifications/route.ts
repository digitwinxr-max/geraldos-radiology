import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createNotificationSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, serviceOpts, listEnvelope } from "@/lib/list-query";
import * as notificationService from "@/services/notifications-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "notifications.read", async () => {
    const parsed = parseListQuery(request, { defaultPageSize: 30 });
    if (!parsed.success) return parsed.error;
    try {
      const { notifications, unread, total } = await notificationService.listNotifications(serviceOpts(parsed.data));
      return NextResponse.json({
        ...listEnvelope(notifications, total, parsed.data.page, parsed.data.pageSize),
        unread,
      });
    } catch (error) {
      return internalError(error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "notifications.write", async () => {
    const v = await validateBody(request, createNotificationSchema);
    if (!v.success) return v.error;

    try {
      const row = await notificationService.createNotification(v.data);
      return NextResponse.json({ ok: true, notification: row }, { status: 201 });
    } catch (error) {
      return internalError(error);
    }
  });
}
