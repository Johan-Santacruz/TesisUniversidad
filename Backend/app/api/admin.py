from __future__ import annotations

from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import AdminUser, get_session
from app.entities import User
from app.schemas import UserCreate, UserList, UserRead, UserUpdate
from app.services.audit import AuditService
from app.services.auth import AuthService


router = APIRouter(prefix="/users", tags=["administration"])


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth


def get_audit_service(request: Request) -> AuditService:
    return request.app.state.audit


@router.get("", response_model=UserList)
def list_users(
    _: AdminUser,
    session: Annotated[Session, Depends(get_session)],
) -> UserList:
    users = list(session.scalars(select(User).order_by(User.email)))
    return UserList(items=[UserRead.model_validate(user) for user in users])


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    admin: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
) -> User:
    existing = session.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con ese correo",
        )
    user = User(
        id=str(uuid4()),
        email=str(payload.email).lower(),
        password_hash=auth.passwords.hash(payload.password),
        role=payload.role.value,
    )
    session.add(user)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con ese correo",
        )
    session.add(
        audit.build_record(
            actor_id=admin.id,
            actor_role=admin.role,
            action="user_created",
            entity_type="user",
            entity_id=user.id,
            details={"role": user.role},
        )
    )
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: str,
    _: AdminUser,
    session: Annotated[Session, Depends(get_session)],
) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    payload: UserUpdate,
    admin: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    changes = payload.model_dump(exclude_unset=True)
    if payload.password is not None:
        user.password_hash = auth.passwords.hash(payload.password)
        auth.revoke_user_sessions(session, user.id)
    if payload.role is not None:
        user.role = payload.role.value
        auth.revoke_user_sessions(session, user.id)
    if payload.is_active is not None:
        user.is_active = payload.is_active
        if not payload.is_active:
            auth.revoke_user_sessions(session, user.id)
    session.add(
        audit.build_record(
            actor_id=admin.id,
            actor_role=admin.role,
            action="user_updated",
            entity_type="user",
            entity_id=user.id,
            details={"changed_fields": sorted(changes)},
        )
    )
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def disable_user(
    user_id: str,
    admin: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
) -> None:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = False
    auth.revoke_user_sessions(session, user.id)
    session.add(
        audit.build_record(
            actor_id=admin.id,
            actor_role=admin.role,
            action="user_disabled",
            entity_type="user",
            entity_id=user.id,
            details={},
        )
    )
