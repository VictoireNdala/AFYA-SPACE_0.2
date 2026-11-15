import os
import sys
from typing import Tuple, List, Optional
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler, LabelEncoder
from sklearn.impute import SimpleImputer
from utils.display import console


def load_and_preprocess_data(
        data_path: str,
        target_col: Optional[str] = None,
        scaler_type: str = 'standard'
) -> Tuple[np.ndarray, Optional[np.ndarray], List[str]]:
    if not os.path.exists(data_path):
        console.print(f"[bold red]Error:[/bold red] File path {data_path} does not exist.")
        sys.exit(1)

    if data_path.endswith('.csv'):
        df = pd.read_csv(data_path)
    elif data_path.endswith('.parquet'):
        df = pd.read_parquet(data_path)
    else:
        df = pd.read_csv(data_path)

    feature_cols = [c for c in df.columns if c != target_col]
    X_df = df[feature_cols].select_dtypes(include=[np.number])

    if X_df.empty:
        console.print("[bold red]Error:[/bold red] No numeric feature columns found.")
        sys.exit(1)

    imputer = SimpleImputer(strategy='median')
    X_imputed = imputer.fit_transform(X_df)

    scalers = {
        'standard': StandardScaler(),
        'minmax': MinMaxScaler(),
        'robust': RobustScaler()
    }
    scaler = scalers.get(scaler_type, StandardScaler())
    X_scaled = scaler.fit_transform(X_imputed)

    y = None
    if target_col:
        if target_col not in df.columns:
            console.print(f"[bold red]Error:[/bold red] Target column '{target_col}' not found in {data_path}.")
            sys.exit(1)

        y_series = df[target_col]
        if y_series.dtype == 'object' or isinstance(y_series.dtype, pd.CategoricalDtype) or "string" in str(
                y_series.dtype):
            le = LabelEncoder()
            y = le.fit_transform(y_series.astype(str).to_numpy())
        else:
            y = y_series.to_numpy()

    return X_scaled, y, list(X_df.columns)