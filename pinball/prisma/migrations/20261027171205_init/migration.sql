-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "passwordHash" TEXT,
    "rationalReminder" BOOLEAN NOT NULL DEFAULT true,
    "contributeAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "contributeAnonymous" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("tenantId","userId")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "venue" TEXT,
    "holeCount" INTEGER NOT NULL DEFAULT 12,
    "holeNumbering" TEXT NOT NULL DEFAULT 'ltr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "roundCount" INTEGER NOT NULL DEFAULT 0,
    "totalBet" INTEGER NOT NULL DEFAULT 0,
    "totalWin" INTEGER NOT NULL DEFAULT 0,
    "cards" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "litHoles" INTEGER[],
    "baseBet" INTEGER NOT NULL,
    "extraBet" INTEGER NOT NULL,
    "totalBet" INTEGER NOT NULL,
    "power" TEXT NOT NULL,
    "landHole" INTEGER NOT NULL,
    "hit" BOOLEAN NOT NULL,
    "reward" INTEGER NOT NULL,
    "cardIssued" INTEGER NOT NULL,
    "recommendedPower" TEXT,
    "recommendMode" TEXT,
    "modelVersion" INTEGER NOT NULL DEFAULT 1,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posterior" (
    "tenantId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "power" TEXT NOT NULL,
    "counts" INTEGER[]
);

-- CreateTable
CREATE TABLE "SimParams" (
    "tenantId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "power" TEXT NOT NULL,
    "pegBias" DOUBLE PRECISION NOT NULL,
    "entryOffset" DOUBLE PRECISION NOT NULL,
    "spread" DOUBLE PRECISION NOT NULL,
    "fittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampleN" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "BanditArm" (
    "tenantId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "power" TEXT NOT NULL,
    "alpha" DOUBLE PRECISION NOT NULL,
    "beta" DOUBLE PRECISION NOT NULL
);

-- CreateTable
CREATE TABLE "McSimCache" (
    "tenantId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "power" TEXT NOT NULL,
    "fitVersion" INTEGER NOT NULL,
    "dist" DOUBLE PRECISION[],
    "stderr" DOUBLE PRECISION[],
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalPrior" (
    "power" TEXT NOT NULL,
    "counts" INTEGER[],
    "sampleN" INTEGER NOT NULL,

    CONSTRAINT "GlobalPrior_pkey" PRIMARY KEY ("power")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "invitedBy" UUID,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Machine_tenantId_idx" ON "Machine"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_tenantId_code_key" ON "Machine"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Session_tenantId_machineId_idx" ON "Session"("tenantId", "machineId");

-- CreateIndex
CREATE INDEX "Session_tenantId_idx" ON "Session"("tenantId");

-- CreateIndex
CREATE INDEX "Round_tenantId_sessionId_idx" ON "Round"("tenantId", "sessionId");

-- CreateIndex
CREATE INDEX "Round_tenantId_machineId_createdAt_idx" ON "Round"("tenantId", "machineId", "createdAt");

-- CreateIndex
CREATE INDEX "Round_tenantId_idx" ON "Round"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_tenantId_sessionId_clientRequestId_key" ON "Round"("tenantId", "sessionId", "clientRequestId");

-- CreateIndex
CREATE INDEX "Posterior_tenantId_idx" ON "Posterior"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Posterior_tenantId_machineId_power_key" ON "Posterior"("tenantId", "machineId", "power");

-- CreateIndex
CREATE INDEX "SimParams_tenantId_idx" ON "SimParams"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SimParams_tenantId_machineId_power_key" ON "SimParams"("tenantId", "machineId", "power");

-- CreateIndex
CREATE INDEX "BanditArm_tenantId_idx" ON "BanditArm"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BanditArm_tenantId_machineId_power_key" ON "BanditArm"("tenantId", "machineId", "power");

-- CreateIndex
CREATE INDEX "McSimCache_tenantId_idx" ON "McSimCache"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "McSimCache_tenantId_machineId_power_fitVersion_key" ON "McSimCache"("tenantId", "machineId", "power", "fitVersion");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "OtpCode_email_code_idx" ON "OtpCode"("email", "code");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_sessionToken_key" ON "AuthSession"("sessionToken");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_tenantId_idx" ON "Invitation"("tenantId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posterior" ADD CONSTRAINT "Posterior_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posterior" ADD CONSTRAINT "Posterior_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimParams" ADD CONSTRAINT "SimParams_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimParams" ADD CONSTRAINT "SimParams_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanditArm" ADD CONSTRAINT "BanditArm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanditArm" ADD CONSTRAINT "BanditArm_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McSimCache" ADD CONSTRAINT "McSimCache_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McSimCache" ADD CONSTRAINT "McSimCache_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_email_fkey" FOREIGN KEY ("email") REFERENCES "User"("email") ON DELETE CASCADE ON UPDATE CASCADE;
