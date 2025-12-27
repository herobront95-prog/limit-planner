import logging
import pandas as pd
from typing import Dict
from database import db


def evaluate_filter_expression(expression: str, limits: float, ostatok: float, zakaz: float) -> bool:
    """
    Safely evaluate filter expression.
    Supported: Лимиты, Остаток, Заказ, +, -, *, /, >, <, >=, <=, ==, !=
    """
    try:
        expr = expression.replace('Лимиты', str(limits))
        expr = expr.replace('Остаток', str(ostatok))
        expr = expr.replace('Заказ', str(zakaz))
        
        allowed_names = {}
        allowed_ops = {'__builtins__': {}}
        
        result = eval(expr, allowed_ops, allowed_names)
        return bool(result)
    except Exception as e:
        logging.error(f"Filter expression error: {e}")
        return True


async def apply_product_mappings(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply product mappings (synonyms) and merge rows with same products.
    Searches for synonyms as SUBSTRINGS and merges them.
    Keeps the FIRST found full product name (preserves original name for limit matching).
    Sums up stock values for merged products.
    """
    try:
        # Get all mappings
        mappings = await db.product_mappings.find({}, {"_id": 0}).to_list(1000)
        
        if not mappings:
            return df
        
        # Build list of (pattern, group_id) for grouping
        patterns = []
        for idx, mapping in enumerate(mappings):
            main_product = mapping['main_product']
            group_id = f"group_{idx}"
            patterns.append((main_product.lower().strip(), group_id))
            for synonym in mapping.get('synonyms', []):
                patterns.append((synonym.lower().strip(), group_id))
        
        # Sort patterns by length (longest first) to match most specific first
        patterns.sort(key=lambda x: len(x[0]), reverse=True)
        
        # Find group for each product
        def find_group(product_name):
            product_lower = str(product_name).lower().strip()
            for pattern, group_id in patterns:
                if pattern in product_lower:
                    return group_id
            return None
        
        # Assign groups
        df['_group'] = df['Товар'].apply(find_group)
        
        # For products with groups, merge them
        grouped_products = df[df['_group'].notna()]
        ungrouped_products = df[df['_group'].isna()].copy()
        
        if len(grouped_products) > 0:
            # Group by _group, keep first product name, sum stock
            merged = grouped_products.groupby('_group').agg({
                'Товар': 'first',
                'Остаток': 'sum'
            }).reset_index(drop=True)
            
            # Log merges
            for group_id in grouped_products['_group'].unique():
                group_rows = grouped_products[grouped_products['_group'] == group_id]
                if len(group_rows) > 1:
                    merged_name = group_rows['Товар'].iloc[0]
                    total_stock = group_rows['Остаток'].sum()
                    logging.info(f"Merged {len(group_rows)} products into '{merged_name}' with total stock {total_stock}")
            
            # Combine merged and ungrouped
            ungrouped_products = ungrouped_products.drop('_group', axis=1)
            result = pd.concat([merged, ungrouped_products], ignore_index=True)
        else:
            result = ungrouped_products.drop('_group', axis=1)
        
        logging.info(f"Applied product mappings: {len(df)} rows -> {len(result)} rows")
        return result
        
    except Exception as e:
        logging.error(f"Error applying product mappings: {e}")
        return df
