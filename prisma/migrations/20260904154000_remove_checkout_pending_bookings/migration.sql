DELETE FROM "Booking" WHERE "status" = 'pending';
UPDATE "Booking" SET "workflowStatus" = 'confirmed' WHERE "workflowStatus" = 'reserved';
