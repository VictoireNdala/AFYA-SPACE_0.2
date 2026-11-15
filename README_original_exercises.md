### Installation
1. Separate data from target for segmentation/anomaly detection

```
python preprocess.py data/iris.csv --data_out iris_data.csv --label_out iris_label.csv
```

2. Classification comparison (with KNN grid search)

```
python main.py --task classification --data_path data/iris.csv --target_col Species --model_name all --tune
```

3. Segmentation with dynamic K estimate

```
python main.py --task segmentation --data_path data/iris_data.csv --model_name all --estimate_k
```

4. Anomaly detection across models

```
python main.py --task anomaly_detection --data_path data/iris_label.csv --model_name all
```
## Exercice
1. Calcule la sortie de l'object: 
```
[17,5.4,3.9,1.3,0.4]
```
2. Separe les données de la cible pour telco-customer-churn.xls
3. Normalise et convertis les données telco-customer-churn.xls
4. Ajoute le nombre d'epochs et learning-rate comme parametres à renseigner sur console
5. Affiche en rouge les anomalies détectées par un algorithme
6. Fais tourner le même code sur telco-customer-churn.xls
7. Adapte le code de l'anomalie détection à une tâche de classification
8. Dis si le client suivant est churnable ou pas?
```
7469-LKBCI,Male,0,No,No,16,Yes,No,No,No internet service,No internet service,No internet service,No internet service,No internet service,No internet service,Two year,No,Credit card (automatic),18.95,326.8
```