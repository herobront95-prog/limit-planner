import re
from typing import Dict, Optional
import unicodedata

LAT_TO_CYR = str.maketrans({
    "A": "А", "B": "В", "C": "С", "E": "Е", "H": "Н",
    "K": "К", "M": "М", "O": "О", "P": "Р", "T": "Т",
    "X": "Х", "Y": "У",
    "a": "а", "c": "с", "e": "е", "o": "о",
    "p": "р", "x": "х", "y": "у",
})

def normalize_name(text: str) -> str:
    if not text:
        return ""

    text = unicodedata.normalize("NFKC", str(text))
    text = text.translate(LAT_TO_CYR)

    # привести все тире к обычному дефису
    text = text.replace("–", "-").replace("—", "-")

    # нормализовать пробелы
    text = re.sub(r"\s+", " ", text)

    return text.strip()



def tokenize(text: str) -> tuple:
    text = normalize_name(text).lower()
    tokens = re.findall(r'\d+|[a-zA-Zа-яА-ЯёЁ]+', text)
    return tuple(tokens)


def find_exact_match(product_name: str, limits_dict: Dict[str, int]) -> Optional[str]:
    """
    Fast exact matching - for when product names match limit names exactly.
    """
    # Try exact match first
    if product_name in limits_dict:
        return product_name
    
    # Try case-insensitive match
    product_lower = product_name.lower().strip()
    for limit_key in limits_dict.keys():
        if limit_key.lower().strip() == product_lower:
            return limit_key
    
    return None


def find_best_match_improved(product_name: str, limits_dict: Dict[str, int]) -> Optional[str]:
    """
    Improved matching algorithm that correctly distinguishes between similar products.
    Uses tokenization to avoid matching '25' with '250' or '57595925'.
    """
    # First try exact match (fast path)
    exact = find_exact_match(product_name, limits_dict)
    if exact:
        return exact
    
    product_tokens = tokenize(product_name.lower())
    
    best_match = None
    best_score = 0
    
    for limit_key in limits_dict.keys():
        limit_tokens = tokenize(limit_key.lower())
        
        if not limit_tokens:
            continue
        
        # Check if all limit tokens are present in product tokens
        matches = 0
        exact_matches = 0
        
        for limit_token in limit_tokens:
            if limit_token in product_tokens:
                exact_matches += 1
            # Check partial match for words only (not numbers)
            elif not limit_token.isdigit():
                for product_token in product_tokens:
                    if not product_token.isdigit() and limit_token in product_token:
                        matches += 1
                        break
        
        # Calculate score: prioritize exact matches, especially for numbers
        total_limit_tokens = len(limit_tokens)
        if exact_matches == total_limit_tokens:
            # Perfect match - all tokens match exactly
            score = exact_matches * 10000 + len(limit_key)
        elif exact_matches + matches >= total_limit_tokens:
            # Partial match
            score = exact_matches * 1000 + matches * 100 + len(limit_key)
        else:
            continue
        
        if score > best_score:
            best_score = score
            best_match = limit_key
    
    return best_match
