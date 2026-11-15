import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
from tqdm import tqdm
import tensorflow as tf
from tensorflow.keras import Sequential
from tensorflow.keras.layers import Dense, Dropout
from tqdm.keras import TqdmCallback


class PyTorchMLP(nn.Module):
    def __init__(self, input_dim: int, output_dim: int, is_regression: bool = False):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, output_dim)
        )
        self.is_regression = is_regression

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def train_pytorch_mlp(
        X_train: np.ndarray,
        y_train: np.ndarray,
        is_regression: bool = False,
        epochs: int = 50,
        batch_size: int = 32,
        lr: float = 0.001
) -> nn.Module:
    input_dim = X_train.shape[1]
    if is_regression:
        output_dim = 1
        y_train_t = torch.tensor(y_train, dtype=torch.float32).unsqueeze(1)
        criterion = nn.MSELoss()
    else:
        output_dim = len(np.unique(y_train))
        y_train_t = torch.tensor(y_train, dtype=torch.long)
        criterion = nn.CrossEntropyLoss()

    X_train_t = torch.tensor(X_train, dtype=torch.float32)
    dataset = TensorDataset(X_train_t, y_train_t)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    model = PyTorchMLP(input_dim, output_dim, is_regression)
    optimizer = optim.Adam(model.parameters(), lr=lr)

    model.train()
    for _ in tqdm(range(epochs), desc="Training PyTorch MLP"):
        for bx, by in loader:
            optimizer.zero_grad()
            out = model(bx)
            loss = criterion(out, by)
            loss.backward()
            optimizer.step()

    return model


class PyTorchAutoencoder(nn.Module):
    def __init__(self, input_dim: int, encoding_dim: int = 8):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 32),
            nn.ReLU(),
            nn.Linear(32, encoding_dim),
            nn.ReLU()
        )
        self.decoder = nn.Sequential(
            nn.Linear(encoding_dim, 32),
            nn.ReLU(),
            nn.Linear(32, input_dim)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        encoded = self.encoder(x)
        return self.decoder(encoded)


def get_autoencoder_reconstruction_error(
        X: np.ndarray,
        epochs: int = 40,
        batch_size: int = 32
) -> np.ndarray:
    input_dim = X.shape[1]
    model = PyTorchAutoencoder(input_dim)
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.MSELoss()

    X_t = torch.tensor(X, dtype=torch.float32)
    loader = DataLoader(TensorDataset(X_t), batch_size=batch_size, shuffle=True)

    model.train()
    for _ in tqdm(range(epochs), desc="Training PyTorch Autoencoder"):
        for (bx,) in loader:
            optimizer.zero_grad()
            rec = model(bx)
            loss = criterion(rec, bx)
            loss.backward()
            optimizer.step()

    model.eval()
    with torch.no_grad():
        reconstructed = model(X_t)
        errors = torch.mean((X_t - reconstructed) ** 2, dim=1).numpy()

    return errors


def train_tensorflow_mlp(
        X_train: np.ndarray,
        y_train: np.ndarray,
        is_regression: bool = False,
        epochs: int = 50,
        batch_size: int = 32,
        lr: float = 0.001
):
    input_dim = X_train.shape[1]
    model = Sequential([
        Dense(64, activation='relu', input_shape=(input_dim,)),
        Dropout(0.2),
        Dense(32, activation='relu'),
    ])

    optimizer = tf.keras.optimizers.Adam(learning_rate=lr)

    if is_regression:
        model.add(Dense(1, activation='linear'))
        model.compile(optimizer=optimizer, loss='mse')
    else:
        num_classes = len(np.unique(y_train))
        if num_classes == 2:
            model.add(Dense(1, activation='sigmoid'))
            model.compile(optimizer=optimizer, loss='binary_crossentropy', metrics=['accuracy'])
        else:
            model.add(Dense(num_classes, activation='softmax'))
            model.compile(optimizer=optimizer, loss='sparse_categorical_crossentropy', metrics=['accuracy'])

    model.fit(
        X_train, y_train,
        epochs=epochs,
        batch_size=batch_size,
        verbose=0,
        callbacks=[TqdmCallback(verbose=1)]
    )

    return model