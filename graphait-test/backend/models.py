"""
SQLAlchemy models for Battleship game backend.
Handles game state, players, ships, and attacks.
"""

from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, Enum, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()


class GameStatus(enum.Enum):
    SETUP = "setup"  # Players placing ships
    PLAYING = "playing"  # Players attacking
    FINISHED = "finished"  # Game over


class PlayerRole(enum.Enum):
    PLAYER_1 = "player1"
    PLAYER_2 = "player2"


class ShipType(enum.Enum):
    CARRIER = "carrier"
    BATTLESHIP = "battleship"
    CRUISER = "cruiser"
    SUBMARINE = "submarine"
    DESTROYER = "destroyer"


class AttackResult(enum.Enum):
    HIT = "hit"
    MISS = "miss"


class Game(Base):
    """Represents a Battleship game between two players."""
    __tablename__ = "games"

    id = Column(String, primary_key=True)
    status = Column(Enum(GameStatus), default=GameStatus.SETUP, nullable=False)
    current_turn = Column(Enum(PlayerRole), default=PlayerRole.PLAYER_1, nullable=False)
    winner = Column(Enum(PlayerRole), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    players = relationship("Player", back_populates="game", cascade="all, delete-orphan")
    attacks = relationship("Attack", back_populates="game", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "status": self.status.value,
            "current_turn": self.current_turn.value,
            "winner": self.winner.value if self.winner else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }


class Player(Base):
    """Represents a player in a game."""
    __tablename__ = "players"

    id = Column(String, primary_key=True)
    game_id = Column(String, ForeignKey("games.id"), nullable=False)
    role = Column(Enum(PlayerRole), nullable=False)
    name = Column(String(50))
    is_ready = Column(Boolean, default=False)

    # Relationships
    game = relationship("Game", back_populates="players")
    ships = relationship("Ship", back_populates="player", cascade="all, delete-orphan")

    def to_dict(self, include_ships=False):
        result = {
            "id": self.id,
            "game_id": self.game_id,
            "role": self.role.value,
            "name": self.name,
            "is_ready": self.is_ready
        }
        if include_ships:
            result["ships"] = [ship.to_dict() for ship in self.ships]
        return result


class Ship(Base):
    """Represents a ship placed on a player's board."""
    __tablename__ = "ships"

    id = Column(String, primary_key=True)
    player_id = Column(String, ForeignKey("players.id"), nullable=False)
    ship_type = Column(Enum(ShipType), nullable=False)
    # JSON array of cell coordinates [{"row": 0, "col": 0}, ...]
    cells = Column(JSON, nullable=False)
    orientation = Column(String, nullable=False)  # "horizontal" or "vertical"
    is_sunk = Column(Boolean, default=False)

    # Relationships
    player = relationship("Player", back_populates="ships")

    def get_hit_cells(self):
        """Return the number of cells that have been hit."""
        hit_count = 0
        for cell in self.cells:
            if cell.get("is_hit", False):
                hit_count += 1
        return hit_count

    def check_if_sunk(self):
        """Check if all cells of the ship have been hit."""
        return all(cell.get("is_hit", False) for cell in self.cells)

    def mark_cell_hit(self, row, col):
        """Mark a specific cell as hit and return True if it was hit."""
        for cell in self.cells:
            if cell["row"] == row and cell["col"] == col:
                cell["is_hit"] = True
                return True
        return False

    def to_dict(self, show_hidden=False):
        """
        Return ship data.
        If show_hidden is False, hide ship details (for opponent's view).
        """
        if not show_hidden and not self.is_sunk:
            # For opponent, only show if ship is sunk
            return {
                "id": self.id,
                "ship_type": None,
                "is_sunk": self.is_sunk
            }
        
        # For owner or sunk ships, show full details
        return {
            "id": self.id,
            "player_id": self.player_id,
            "ship_type": self.ship_type.value,
            "cells": self.cells,
            "orientation": self.orientation,
            "is_sunk": self.is_sunk,
            "hits": self.get_hit_cells()
        }


class Attack(Base):
    """Represents an attack made by a player."""
    __tablename__ = "attacks"

    id = Column(String, primary_key_index=True)
    game_id = Column(String, ForeignKey("games.id"), nullable=False)
    attacker_id = Column(String, nullable=False)  # Reference to player ID
    row = Column(Integer, nullable=False)
    col = Column(Integer, nullable=False)
    result = Column(Enum(AttackResult), nullable=False)
    ship_id = Column(String, ForeignKey("ships.id"), nullable=True)  # Hit ship ID if applicable
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    game = relationship("Game", back_populates="attacks")

    def to_dict(self):
        return {
            "id": self.id,
            "game_id": self.game_id,
            "attacker_id": self.attacker_id,
            "row": self.row,
            "col": self.col,
            "result": self.result.value,
            "ship_id": self.ship_id,
            "created_at": self.created_at.isoformat()
        }
