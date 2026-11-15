from typing import Dict, Any
import numpy as np
from sklearn.cluster import KMeans
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.model_selection import GridSearchCV
from sklearn.metrics import silhouette_score
from utils.display import console


def estimate_best_k_kmeans(X: np.ndarray, k_min: int = 2, k_max: int = 10) -> int:
    best_k = k_min
    best_score = -1.0
    for k in range(k_min, min(k_max + 1, len(X))):
        km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(X)
        if len(np.unique(km.labels_)) > 1:
            score = silhouette_score(X, km.labels_)
            if score > best_score:
                best_score = score
                best_k = k

    console.print(f"[bold cyan]Optimal K for KMeans (Silhouette):[/bold cyan] {best_k} (Score: {best_score:.4f})")
    return best_k


def tune_knn(X_train: np.ndarray, y_train: np.ndarray, is_regression: bool = False) -> Dict[str, Any]:
    max_k = min(20, max(2, len(X_train) // 2))
    k_range = list(range(1, max_k))

    param_grid = {'n_neighbors': k_range, 'weights': ['uniform', 'distance']}
    base_model = KNeighborsRegressor() if is_regression else KNeighborsClassifier()

    grid = GridSearchCV(base_model, param_grid, cv=3, scoring='r2' if is_regression else 'f1_weighted', n_jobs=1)
    grid.fit(X_train, y_train)

    console.print(f"[bold cyan]Optimal KNN Params:[/bold cyan] {grid.best_params_}")
    return grid.best_params_