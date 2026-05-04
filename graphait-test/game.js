// Battleship Ship Configuration
const SHIPS = [
    { id: 'carrier', name: 'Carrier', size: 5, colorClass: 'ship-carrier', color: '#ff3333' },
    { id: 'battleship', name: 'Battleship', size: 4, colorClass: 'ship-battleship', color: '#ff8c00' },
    { id: 'cruiser', name: 'Cruiser', size: 3, colorClass: 'ship-cruiser', color: '#00ff00' },
    { id: 'submarine', name: 'Submarine', size: 3, colorClass: 'ship-submarine', color: '#00ffff' },
    { id: 'destroyer', name: 'Destroyer', size: 2, colorClass: 'ship-destroyer', color: '#00bfff' }
];

const GRID_SIZE = 10;
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const ROWS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

// Game State
let selectedShip = null;
let placedShips = [];
let gridState = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
let selectedCell = null;
let focusedCellIndex = 0; // For keyboard navigation

// DOM Elements
const shipsList = document.getElementById('shipsList');
const gridContainer = document.getElementById('gridContainer');
const positionInput = document.getElementById('positionInput');
const orientationSelect = document.getElementById('orientationSelect');
const placeShipButton = document.getElementById('placeShipButton');
const errorMessage = document.getElementById('errorMessage');
const shipsPlacedDisplay = document.getElementById('shipsPlaced');
const gameStatusDisplay = document.getElementById('gameStatus');

// Initialize the game
function init() {
    renderShipsList();
    renderGrid();
    setupEventListeners();
    selectFirstShip();
}

// Render the ships list in the fleet panel
function renderShipsList() {
    shipsList.innerHTML = '';
    
    SHIPS.forEach(ship => {
        const isPlaced = placedShips.some(placed => placed.id === ship.id);
        
        const shipItem = document.createElement('div');
        shipItem.className = `ship-item ${isPlaced ? 'placed' : ''}`;
        shipItem.dataset.shipId = ship.id;
        shipItem.setAttribute('role', 'button');
        shipItem.setAttribute('aria-label', `${ship.name}, ${ship.size} cells${isPlaced ? ', already placed' : ''}`);
        shipItem.setAttribute('tabindex', isPlaced ? '-1' : '0');
        
        // Ship preview cells
        const preview = document.createElement('div');
        preview.className = 'ship-preview';
        for (let i = 0; i < ship.size; i++) {
            const cell = document.createElement('div');
            cell.className = `ship-cell ${ship.colorClass}`;
            preview.appendChild(cell);
        }
        
        // Ship info
        const info = document.createElement('div');
        info.className = 'ship-info';
        const name = document.createElement('div');
        name.className = 'ship-name';
        name.textContent = ship.name;
        const size = document.createElement('div');
        size.className = 'ship-size';
        size.textContent = `${ship.size} cells`;
        info.appendChild(name);
        info.appendChild(size);
        
        shipItem.appendChild(preview);
        shipItem.appendChild(info);
        
        if (!isPlaced) {
            shipItem.addEventListener('click', () => selectShip(ship.id));
            shipItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectShip(ship.id);
                }
            });
        }
        
        shipsList.appendChild(shipItem);
    });
}

// Render the 10x10 grid
function renderGrid() {
    gridContainer.innerHTML = '';
    
    // Top-left corner (empty)
    const corner = document.createElement('div');
    corner.className = 'grid-header-cell';
    gridContainer.appendChild(corner);
    
    // Column headers (A-J)
    COLS.forEach(col => {
        const header = document.createElement('div');
        header.className = 'grid-header-cell';
        header.textContent = col;
        gridContainer.appendChild(header);
    });
    
    // Grid rows
    for (let row = 0; row < GRID_SIZE; row++) {
        // Row label (1-10)
        const rowLabel = document.createElement('div');
        rowLabel.className = 'grid-row-label';
        rowLabel.textContent = row + 1;
        gridContainer.appendChild(rowLabel);
        
        // Grid cells
        for (let col = 0; col < GRID_SIZE; col++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.dataset.coordinate = `${COLS[col]}${row + 1}`;
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('tabindex', col === 0 && row === 0 ? '0' : '-1');
            cell.setAttribute('aria-label', `Position ${COLS[col]}${row + 1}`);
            
            cell.addEventListener('click', () => handleCellClick(row, col));
            cell.addEventListener('keydown', handleCellKeydown);
            cell.addEventListener('focus', () => {
                focusedCellIndex = row * GRID_SIZE + col;
                updatePreview();
            });
            
            gridContainer.appendChild(cell);
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    // Start button
    document.getElementById('startButton').addEventListener('click', startGame);
    document.getElementById('playAgainButton').addEventListener('click', resetGame);
    
    // Place ship button
    placeShipButton.addEventListener('click', placeShip);
    
    // Position input
    positionInput.addEventListener('input', () => {
        clearError();
        updatePreview();
    });
    
    // Orientation change
    orientationSelect.addEventListener('change', () => {
        clearError();
        updatePreview();
    });
    
    // Keyboard support for position input
    positionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            placeShip();
        }
    });
}

// Select a ship from the fleet list
function selectShip(shipId) {
    selectedShip = SHIPS.find(s => s.id === shipId);
    
    // Update UI
    document.querySelectorAll('.ship-item').forEach(item => {
        item.classList.remove('selected');
        if (item.dataset.shipId === shipId) {
            item.classList.add('selected');
        }
    });
    
    // Focus the first available cell for better UX
    focusFirstGridCell();
    updatePreview();
    clearError();
}

// Select the first available ship
function selectFirstShip() {
    const availableShip = SHIPS.find(ship => !placedShips.some(placed => placed.id === ship.id));
    if (availableShip) {
        selectShip(availableShip.id);
    }
}

// Handle cell click on the grid
function handleCellClick(row, col) {
    const cellData = gridState[row][col];
    
    if (cellData) {
        // Cell has a ship - ask if user wants to remove it
        const shipId = cellData;
        removeShip(shipId);
    } else {
        // Select this cell for placement
        selectedCell = { row, col };
        positionInput.value = `${COLS[col]}${row + 1}`;
        
        // Update selected cell visual
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.remove('selected');
        });
        const cellElement = getCellElement(row, col);
        if (cellElement) {
            cellElement.classList.add('selected');
        }
        
        updatePreview();
    }
}

// Handle keyboard navigation on grid cells
function handleCellKeydown(e) {
    const row = parseInt(e.target.dataset.row);
    const col = parseInt(e.target.dataset.col);
    let nextRow = row;
    let nextCol = col;
    
    switch (e.key) {
        case 'ArrowUp':
            e.preventDefault();
            nextRow = Math.max(0, row - 1);
            break;
        case 'ArrowDown':
            e.preventDefault();
            nextRow = Math.min(GRID_SIZE - 1, row + 1);
            break;
        case 'ArrowLeft':
            e.preventDefault();
            nextCol = Math.max(0, col - 1);
            break;
        case 'ArrowRight':
            e.preventDefault();
            nextCol = Math.min(GRID_SIZE - 1, col + 1);
            break;
        case 'Enter':
        case ' ':
            e.preventDefault();
            handleCellClick(row, col);
            return;
        default:
            return;
    }
    
    // Move focus to next cell
    const nextCell = getCellElement(nextRow, nextCol);
    if (nextCell) {
        nextCell.focus();
    }
}

// Get a grid cell element
function getCellElement(row, col) {
    return gridContainer.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
}

// Parse position input (e.g., "A5" -> row=4, col=0)
function parsePosition(position) {
    if (!position || position.length < 2 || position.length > 3) {
        return null;
    }
    
    const colChar = position.toUpperCase().charAt(0);
    const rowStr = position.substring(1);
    
    const colIndex = COLS.indexOf(colChar);
    const rowIndex = parseInt(rowStr) - 1;
    
    if (colIndex === -1 || isNaN(rowIndex) || rowIndex < 0 || rowIndex >= GRID_SIZE) {
        return null;
    }
    
    return { row: rowIndex, col: colIndex };
}

// Validate ship placement
function validatePlacement(ship, position, orientation) {
    const cells = [];
    
    for (let i = 0; i < ship.size; i++) {
        let row = position.row;
        let col = position.col;
        
        if (orientation === 'horizontal') {
            col += i;
        } else {
            row += i;
        }
        
        // Check bounds
        if (row >= GRID_SIZE || col >= GRID_SIZE) {
            return { valid: false, error: 'Ship does not fit within grid bounds' };
        }
        
        // Check for overlap
        if (gridState[row][col] !== null) {
            return { valid: false, error: 'Ship would overlap with another ship' };
        }
        
        cells.push({ row, col });
    }
    
    return { valid: true, cells };
}

// Place the selected ship
function placeShip() {
    if (!selectedShip) {
        showError('Please select a ship from your fleet');
        return;
    }
    
    const positionText = positionInput.value.trim().toUpperCase();
    const position = parsePosition(positionText);
    
    if (!position) {
        showError('Invalid position. Use format like "A5" or "J10"');
        return;
    }
    
    const orientation = orientationSelect.value;
    const validation = validatePlacement(selectedShip, position, orientation);
    
    if (!validation.valid) {
        showError(validation.error);
        return;
    }
    
    // Place the ship
    const placedShip = {
        id: selectedShip.id,
        name: selectedShip.name,
        size: selectedShip.size,
        colorClass: selectedShip.colorClass,
        orientation: orientation,
        cells: validation.cells
    };
    
    placedShips.push(placedShip);
    
    // Update grid state
    validation.cells.forEach(cell => {
        gridState[cell.row][cell.col] = selectedShip.id;
    });
    
    // Update UI
    updateGridWithShip(placedShip);
    renderShipsList();
    clearError();
    positionInput.value = '';
    
    // Update stats
    updateStats();
    
    // Check if all ships are placed
    if (placedShips.length === SHIPS.length) {
        allShipsPlaced();
    } else {
        // Select next available ship
        selectFirstShip();
    }
}

// Update the grid to show a placed ship
function updateGridWithShip(ship) {
    ship.cells.forEach(cell => {
        const cellElement = getCellElement(cell.row, cell.col);
        if (cellElement) {
            cellElement.classList.add('has-ship', ship.colorClass);
            cellElement.setAttribute('aria-label', `${ship.name} at ${COLS[cell.col]}${cell.row + 1}`);
        }
    });
}

// Remove a ship from the grid
function removeShip(shipId) {
    const shipIndex = placedShips.findIndex(s => s.id === shipId);
    if (shipIndex === -1) return;
    
    const ship = placedShips[shipIndex];
    
    // Clear grid state
    ship.cells.forEach(cell => {
        gridState[cell.row][cell.col] = null;
        const cellElement = getCellElement(cell.row, cell.col);
        if (cellElement) {
            cellElement.classList.remove('has-ship', ship.colorClass);
            cellElement.removeAttribute('aria-label');
            cellElement.setAttribute('aria-label', `Position ${COLS[cell.col]}${cell.row + 1}`);
        }
    });
    
    // Remove from placed ships
    placedShips.splice(shipIndex, 1);
    
    // Update UI
    renderShipsList();
    updateStats();
    clearError();
    
    // If this was the selected ship, keep it selected
    if (selectedShip && selectedShip.id === shipId) {
        selectShip(shipId);
    } else {
        selectFirstShip();
    }
    
    // Update status if we were complete
    if (placedShips.length < SHIPS.length) {
        gameStatusDisplay.textContent = 'Setup Phase';
        gameStatusDisplay.style.color = 'var(--neon-cyan)';
    }
}

// Update preview on the grid
function updatePreview() {
    // Clear previous previews
    document.querySelectorAll('.grid-cell').forEach(cell => {
        cell.classList.remove('preview', 'preview-invalid');
    });
    
    if (!selectedShip) return;
    
    const positionText = positionInput.value.trim().toUpperCase();
    const position = parsePosition(positionText);
    
    if (!position) return;
    
    const orientation = orientationSelect.value;
    const cells = [];
    
    // Calculate preview cells
    for (let i = 0; i < selectedShip.size; i++) {
        let row = position.row;
        let col = position.col;
        
        if (orientation === 'horizontal') {
            col += i;
        } else {
            row += i;
        }
        
        if (row < GRID_SIZE && col < GRID_SIZE) {
            cells.push({ row, col });
        }
    }
    
    // Check validity
    const validation = validatePlacement(selectedShip, position, orientation);
    const isValid = validation.valid;
    
    // Apply preview styles
    cells.forEach(cell => {
        const cellElement = getCellElement(cell.row, cell.col);
        if (cellElement && !cellElement.classList.contains('has-ship')) {
            cellElement.classList.add(isValid ? 'preview' : 'preview-invalid');
        }
    });
}

// Update stats display
function updateStats() {
    shipsPlacedDisplay.textContent = `${placedShips.length}/${SHIPS.length}`;
}

// Called when all ships are placed
function allShipsPlaced() {
    gameStatusDisplay.textContent = 'Ready!';
    gameStatusDisplay.style.color = 'var(--neon-green)';
    
    // Show victory overlay
    setTimeout(() => {
        document.getElementById('victoryOverlay').classList.add('active');
        document.getElementById('playAgainButton').focus();
    }, 500);
}

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Clear error message
function clearError() {
    errorMessage.textContent = '';
    errorMessage.style.display = 'none';
}

// Start the game (from start screen)
function startGame() {
    document.getElementById('startOverlay').classList.remove('active');
    selectFirstShip();
    focusFirstGridCell();
}

// Reset the game
function resetGame() {
    // Clear state
    placedShips = [];
    gridState = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    selectedShip = null;
    selectedCell = null;
    
    // Reset UI
    document.querySelectorAll('.grid-cell').forEach(cell => {
        cell.className = 'grid-cell';
        cell.setAttribute('aria-label', `Position ${cell.dataset.coordinate}`);
    });
    
    document.getElementById('victoryOverlay').classList.remove('active');
    
    // Reset controls
    positionInput.value = '';
    orientationSelect.value = 'horizontal';
    gameStatusDisplay.textContent = 'Setup Phase';
    gameStatusDisplay.style.color = 'var(--neon-cyan)';
    
    updateStats();
    renderShipsList();
    clearError();
    
    selectFirstShip();
    focusFirstGridCell();
}

// Focus the first grid cell for keyboard navigation
function focusFirstGridCell() {
    setTimeout(() => {
        const firstCell = getCellElement(0, 0);
        if (firstCell) {
            firstCell.focus();
        }
    }, 100);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
