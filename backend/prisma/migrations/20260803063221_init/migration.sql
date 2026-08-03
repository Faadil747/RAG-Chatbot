-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "resumeFileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "currentRole" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "linkedin" TEXT,
    "github" TEXT,
    "portfolio" TEXT,
    "totalExperienceYears" DOUBLE PRECISION NOT NULL,
    "availability" TEXT NOT NULL DEFAULT 'Not Specified',
    "overallRating" DOUBLE PRECISION NOT NULL,
    "skills" JSONB NOT NULL,
    "experience" JSONB NOT NULL,
    "education" JSONB NOT NULL,
    "projects" JSONB NOT NULL,
    "certifications" JSONB NOT NULL,
    "languages" JSONB NOT NULL,
    "previousCompanies" JSONB NOT NULL,
    "aiSummary" TEXT NOT NULL,
    "careerHighlights" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "suitableRoles" JSONB NOT NULL,
    "technologyStack" JSONB NOT NULL,
    "resumeText" TEXT NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "suggestions" JSONB,
    "candidateIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candidate_uploadedAt_idx" ON "Candidate"("uploadedAt");

-- CreateIndex
CREATE INDEX "Candidate_location_idx" ON "Candidate"("location");

-- CreateIndex
CREATE INDEX "Candidate_currentRole_idx" ON "Candidate"("currentRole");

-- CreateIndex
CREATE INDEX "Candidate_availability_idx" ON "Candidate"("availability");

-- CreateIndex
CREATE INDEX "Candidate_totalExperienceYears_idx" ON "Candidate"("totalExperienceYears");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
