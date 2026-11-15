import argparse
import os
import pandas as pd
from sklearn.preprocessing import LabelEncoder


def main():
    parser = argparse.ArgumentParser(
        description="Process CSV, remove the first row, separate features, and numerise labels."
    )
    parser.add_argument("file_path", type=str, help="The path to the input CSV file you want to process.")
    parser.add_argument("--data_out", type=str, default="data/data.csv", help="Path and filename to save the features CSV.")
    parser.add_argument("--label_out", type=str, default="data/label.csv", help="Path and filename to save the label CSV.")

    args = parser.parse_args()
    file_path = args.file_path

    if not os.path.exists(file_path):
        print(f"Error: The file '{file_path}' does not exist.")
        return

    try:
        print(f"Processing file: {file_path}\n" + "-" * 40)

        df = pd.read_csv(file_path)

        df = df.iloc[1:].reset_index(drop=True)

        label_col_name = df.columns[-1]
        labels = df[label_col_name]

        encoder = LabelEncoder()
        numerised_labels = encoder.fit_transform(labels)

        drop_cols = [label_col_name]
        if 'Id' in df.columns:
            drop_cols.append('Id')

        data_df = df.drop(columns=drop_cols)
        label_df = pd.DataFrame({label_col_name: numerised_labels})

        for out_path in [args.data_out, args.label_out]:
            dir_name = os.path.dirname(out_path)
            if dir_name and not os.path.exists(dir_name):
                os.makedirs(dir_name, exist_ok=True)

        data_df.to_csv("data/"+args.data_out, index=False)
        label_df.to_csv("data/"+args.label_out, index=False)

        print(f"Successfully generated '{args.data_out}' and '{args.label_out}' with the first row removed and labels numerised!")

    except Exception as e:
        print(f"An error occurred while processing the file: {e}")


if __name__ == "__main__":
    main()