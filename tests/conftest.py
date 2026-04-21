import os
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-minimum-32-chars!!")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from graphait.database import Base, get_db
from graphait.main import create_app

TEST_DB_URL = "postgresql://graphait:graphait@localhost:5432/graphait_test"


@pytest.fixture(scope="session")
def engine():
    e = create_engine(TEST_DB_URL)
    Base.metadata.create_all(bind=e)
    yield e
    Base.metadata.drop_all(bind=e)


@pytest.fixture()
def db(engine):
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    yield session
    session.rollback()
    session.close()


@pytest.fixture()
def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
