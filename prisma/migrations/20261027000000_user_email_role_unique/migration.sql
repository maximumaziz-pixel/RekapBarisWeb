-- Allow the same email to belong to different account roles.
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";
CREATE UNIQUE INDEX "User_email_role_key" ON "User"("email", "role");
