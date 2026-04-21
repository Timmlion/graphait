import os
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-minimum-32-chars!!")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
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
    connection = engine.connect()
    transaction = connection.begin()
    TestingSession = sessionmaker(bind=connection)
    session = TestingSession()
    session.begin_nested()  # savepoint — commit() inside handlers stays local

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(session, transaction):
        if transaction.nested and not transaction._parent.nested:
            session.begin_nested()

    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
