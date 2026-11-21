import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
import argparse
import sys
import warnings

from utils.data import load_and_preprocess_data
from utils.display import console, print_banner
from models.task_executors import (
    execute_classification_regression,
    execute_segmentation,
    execute_anomaly_detection,
    execute_dimension_reduction,
)

warnings.filterwarnings('ignore')


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Unified ML Pipeline CLI Tool")

    parser.add_argument(
        '--task', type=str, required=True,
        choices=['classification', 'regression', 'anomaly_detection', 'segmentation', 'dimension_reduction'],
        help="ML Task to execute."
    )
    parser.add_argument('--data_path', type=str, required=True, help="Path to input CSV or Parquet file.")
    parser.add_argument('--target_col', type=str, default=None, help="Name of target column for supervised tasks.")
    parser.add_argument(
        '--model_name', type=str, default='all',
        choices=[
            'all', 'kmeans', 'dbscan', 'hierarchical', 'knn', 'svm',
            'mlp_sklearn', 'mlp_pytorch', 'mlp_tensorflow', 'decision_tree', 'random_forest',
            'xgboost', 'isolation_forest', 'one_class_svm', 'lof', 'gmm',
            'autoencoder', 'pca', 'tsne'
        ],
        help="Select specific model or 'all' to compare all eligible algorithms."
    )
    parser.add_argument('--scaler', type=str, default='standard', choices=['standard', 'minmax', 'robust'])
    parser.add_argument('--estimate_k', action='store_true', help="Automate optimal K estimation for KMeans.")
    parser.add_argument('--tune', action='store_true', help="Automate hyperparameter search (e.g., Grid Search for KNN).")
    parser.add_argument('--n_components', type=int, default=2, help="Number of dimensions for reduction techniques.")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    print_banner("Starting Machine Learning Pipeline")

    X, y, _ = load_and_preprocess_data(args.data_path, args.target_col, args.scaler)

    if args.task in ['classification', 'regression']:
        if y is None:
            console.print("[bold red]Error:[/bold red] Target column required for classification/regression.")
            sys.exit(1)
        execute_classification_regression(X, y, args)
    elif args.task == 'segmentation':
        execute_segmentation(X, args)
    elif args.task == 'anomaly_detection':
        execute_anomaly_detection(X, args)
    elif args.task == 'dimension_reduction':
        execute_dimension_reduction(X, args)


if __name__ == '__main__':
    main()