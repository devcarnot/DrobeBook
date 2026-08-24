-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "deliveryMethod" TEXT NOT NULL,
    "eventDate" DATETIME NOT NULL,
    "orderId" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppointmentSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "time" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "changeRoomId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT
);

-- CreateTable
CREATE TABLE "BlockedDate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "date" DATETIME NOT NULL,
    "reason" TEXT
);

-- CreateIndex
CREATE INDEX "Booking_shop_productId_variantId_status_idx" ON "Booking"("shop", "productId", "variantId", "status");

-- CreateIndex
CREATE INDEX "Booking_shop_startDate_endDate_idx" ON "Booking"("shop", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "AppointmentSlot_shop_date_durationMinutes_changeRoomId_idx" ON "AppointmentSlot"("shop", "date", "durationMinutes", "changeRoomId");

-- CreateIndex
CREATE INDEX "BlockedDate_shop_productId_variantId_date_idx" ON "BlockedDate"("shop", "productId", "variantId", "date");
