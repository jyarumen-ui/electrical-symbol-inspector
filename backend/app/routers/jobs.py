from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Job, JobRevision
from ..schemas import JobCreate, JobRead, JobRevisionCreate, JobRevisionRead

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", response_model=JobRead, status_code=201)
async def create_job(body: JobCreate, db: AsyncSession = Depends(get_db)):
    job = Job(**body.model_dump())
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.get("", response_model=list[JobRead])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).order_by(Job.created_at.desc()))
    return result.scalars().all()


@router.get("/{job_id}", response_model=JobRead)
async def get_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.post("/{job_id}/revisions", response_model=JobRevisionRead, status_code=201)
async def create_revision(job_id: UUID, body: JobRevisionCreate, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    rev = JobRevision(job_id=job_id, **body.model_dump())
    db.add(rev)
    await db.commit()
    await db.refresh(rev)
    return rev


@router.get("/{job_id}/revisions", response_model=list[JobRevisionRead])
async def list_revisions(job_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(JobRevision).where(JobRevision.job_id == job_id).order_by(JobRevision.created_at)
    )
    return result.scalars().all()


@router.get("/{job_id}/revisions/diff")
async def diff_revisions(
    job_id: UUID,
    rev_a: UUID,
    rev_b: UUID,
    db: AsyncSession = Depends(get_db),
):
    from ..services.revision_service import compare_revisions
    return await compare_revisions(job_id, rev_a, rev_b, db)
