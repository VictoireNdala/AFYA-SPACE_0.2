import argparse
import numpy as np
import torch
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    mean_squared_error, mean_absolute_error, r2_score,
    silhouette_score, calinski_harabasz_score, davies_bouldin_score
)
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.mixture import GaussianMixture
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.svm import SVC, SVR
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, IsolationForest
from sklearn.svm import OneClassSVM
from sklearn.neighbors import LocalOutlierFactor
from xgboost import XGBClassifier, XGBRegressor

# Local modules
from models.estimators import estimate_best_k_kmeans, tune_knn
from models.neural import train_pytorch_mlp, get_autoencoder_reconstruction_error, train_tensorflow_mlp
from utils.display import print_results_table


def execute_classification_regression(X: np.ndarray, y: np.ndarray, args: argparse.Namespace):
    is_regression = (args.task == 'regression')

    # Automatically encode string targets for classification if needed
    if not is_regression and y is not None:
        if not np.issubdtype(y.dtype, np.number):
            le = LabelEncoder()
            y = le.fit_transform(y.astype(str))

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    models = {}
    target_models = [args.model_name] if args.model_name and args.model_name != 'all' else [
        'knn', 'svm', 'mlp_sklearn', 'mlp_pytorch', 'mlp_tensorflow', 'decision_tree', 'random_forest', 'xgboost'
    ]

    for m in target_models:
        if m == 'knn':
            params = tune_knn(X_train, y_train, is_regression) if args.tune else {}
            models['KNN'] = KNeighborsRegressor(**params) if is_regression else KNeighborsClassifier(**params)
        elif m == 'svm':
            models['SVM'] = SVR() if is_regression else SVC(probability=True)
        elif m == 'mlp_sklearn':
            models['MLP (sklearn)'] = MLPRegressor(random_state=42) if is_regression else MLPClassifier(random_state=42)
        elif m == 'decision_tree':
            models['Decision Tree'] = DecisionTreeRegressor(
                random_state=42) if is_regression else DecisionTreeClassifier(random_state=42)
        elif m == 'random_forest':
            models['Random Forest'] = RandomForestRegressor(
                random_state=42) if is_regression else RandomForestClassifier(random_state=42)
        elif m == 'xgboost':
            models['XGBoost'] = XGBRegressor(random_state=42) if is_regression else XGBClassifier(random_state=42,
                                                                                                  eval_metric='logloss')

    results = []

    # Run Standard scikit-learn & XGBoost Models
    for name, model in models.items():
        model.fit(X_train, y_train)
        preds = model.predict(X_test)

        if is_regression:
            results.append({
                "Model": name,
                "MSE": f"{mean_squared_error(y_test, preds):.4f}",
                "MAE": f"{mean_absolute_error(y_test, preds):.4f}",
                "R2": f"{r2_score(y_test, preds):.4f}"
            })
        else:
            results.append({
                "Model": name,
                "Accuracy": f"{accuracy_score(y_test, preds):.4f}",
                "Precision": f"{precision_score(y_test, preds, average='weighted', zero_division=0):.4f}",
                "Recall": f"{recall_score(y_test, preds, average='weighted', zero_division=0):.4f}",
                "F1-Score": f"{f1_score(y_test, preds, average='weighted', zero_division=0):.4f}"
            })

    if 'mlp_pytorch' in target_models:
        pt_model = train_pytorch_mlp(X_train, y_train, is_regression=is_regression)
        pt_model.eval()
        with torch.no_grad():
            t_preds = pt_model(torch.tensor(X_test, dtype=torch.float32))
            if is_regression:
                preds = t_preds.numpy().squeeze()
                results.append({
                    "Model": "MLP (PyTorch)",
                    "MSE": f"{mean_squared_error(y_test, preds):.4f}",
                    "MAE": f"{mean_absolute_error(y_test, preds):.4f}",
                    "R2": f"{r2_score(y_test, preds):.4f}"
                })
            else:
                preds = torch.argmax(t_preds, dim=1).numpy()
                results.append({
                    "Model": "MLP (PyTorch)",
                    "Accuracy": f"{accuracy_score(y_test, preds):.4f}",
                    "Precision": f"{precision_score(y_test, preds, average='weighted', zero_division=0):.4f}",
                    "Recall": f"{recall_score(y_test, preds, average='weighted', zero_division=0):.4f}",
                    "F1-Score": f"{f1_score(y_test, preds, average='weighted', zero_division=0):.4f}"
                })

    if 'mlp_tensorflow' in target_models:
        tf_model = train_tensorflow_mlp(X_train, y_train, is_regression=is_regression)
        tf_preds = tf_model.predict(X_test, verbose=0)

        if is_regression:
            preds = tf_preds.squeeze()
            results.append({
                "Model": "MLP (TensorFlow)",
                "MSE": f"{mean_squared_error(y_test, preds):.4f}",
                "MAE": f"{mean_absolute_error(y_test, preds):.4f}",
                "R2": f"{r2_score(y_test, preds):.4f}"
            })
        else:
            num_classes = len(np.unique(y_train))
            if num_classes == 2:
                preds = (tf_preds > 0.5).astype(int).squeeze()
            else:
                preds = np.argmax(tf_preds, axis=1)

            results.append({
                "Model": "MLP (TensorFlow)",
                "Accuracy": f"{accuracy_score(y_test, preds):.4f}",
                "Precision": f"{precision_score(y_test, preds, average='weighted', zero_division=0):.4f}",
                "Recall": f"{recall_score(y_test, preds, average='weighted', zero_division=0):.4f}",
                "F1-Score": f"{f1_score(y_test, preds, average='weighted', zero_division=0):.4f}"
            })

    print_results_table(f"Results Comparison: {args.task.capitalize()}", results, style_color="cyan")


def execute_segmentation(X: np.ndarray, args: argparse.Namespace):
    target_models = [args.model_name] if args.model_name and args.model_name != 'all' else ['kmeans', 'dbscan',
                                                                                            'hierarchical']
    results = []

    for m in target_models:
        if m == 'kmeans':
            k = estimate_best_k_kmeans(X) if args.estimate_k else 3
            model = KMeans(n_clusters=k, random_state=42)
            labels = model.fit_predict(X)
            name = f"KMeans (k={k})"
        elif m == 'dbscan':
            model = DBSCAN(eps=0.5, min_samples=5)
            labels = model.fit_predict(X)
            name = "DBSCAN"
        elif m == 'hierarchical':
            model = AgglomerativeClustering(n_clusters=3)
            labels = model.fit_predict(X)
            name = "Hierarchical"

        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        if n_clusters > 1:
            results.append({
                "Model": name,
                "Clusters": str(n_clusters),
                "Silhouette": f"{silhouette_score(X, labels):.4f}",
                "Calinski-Harabasz": f"{calinski_harabasz_score(X, labels):.2f}",
                "Davies-Bouldin": f"{davies_bouldin_score(X, labels):.4f}"
            })
        else:
            results.append({
                "Model": name,
                "Clusters": str(n_clusters),
                "Silhouette": "N/A",
                "Calinski-Harabasz": "N/A",
                "Davies-Bouldin": "N/A"
            })

    print_results_table("Segmentation Results", results, style_color="green")


def execute_anomaly_detection(X: np.ndarray, args: argparse.Namespace):
    target_models = [args.model_name] if args.model_name and args.model_name != 'all' else [
        'isolation_forest', 'one_class_svm', 'lof', 'gmm', 'autoencoder'
    ]
    results = []

    for m in target_models:
        if m == 'isolation_forest':
            model = IsolationForest(contamination=0.1, random_state=42)
            preds = model.fit_predict(X)
            anomalies = np.sum(preds == -1)
            name = "Isolation Forest"
        elif m == 'one_class_svm':
            model = OneClassSVM(nu=0.1)
            preds = model.fit_predict(X)
            anomalies = np.sum(preds == -1)
            name = "OneClassSVM"
        elif m == 'lof':
            model = LocalOutlierFactor(n_neighbors=20, contamination=0.1)
            preds = model.fit_predict(X)
            anomalies = np.sum(preds == -1)
            name = "Local Outlier Factor"
        elif m == 'gmm':
            gmm = GaussianMixture(n_components=2, random_state=42).fit(X)
            scores = gmm.score_samples(X)
            threshold = np.percentile(scores, 10)
            anomalies = np.sum(scores < threshold)
            name = "GMM (Density Threshold)"
        elif m == 'autoencoder':
            errors = get_autoencoder_reconstruction_error(X)
            threshold = np.percentile(errors, 90)
            anomalies = np.sum(errors > threshold)
            name = "Autoencoder (PyTorch)"

        results.append({
            "Model": name,
            "Total Instances": str(len(X)),
            "Anomalies Detected": str(anomalies)
        })

    print_results_table("Anomaly Detection Summary", results, style_color="magenta")


def execute_dimension_reduction(X: np.ndarray, args: argparse.Namespace):
    n_components = args.n_components
    target_models = [args.model_name] if args.model_name and args.model_name != 'all' else ['pca', 'tsne']

    results = []
    for m in target_models:
        if m == 'pca':
            pca = PCA(n_components=n_components)
            _ = pca.fit_transform(X)
            var_ratio = np.sum(pca.explained_variance_ratio_)
            results.append({
                "Method": "PCA",
                "Components": str(n_components),
                "Explained Variance Ratio": f"{var_ratio:.4f}"
            })
        elif m == 'tsne':
            tsne = TSNE(n_components=min(n_components, 3), random_state=42)
            _ = tsne.fit_transform(X)
            results.append({
                "Method": "t-SNE",
                "Components": str(min(n_components, 3)),
                "Explained Variance Ratio": "N/A"
            })

    print_results_table("Dimensionality Reduction Summary", results, style_color="yellow")