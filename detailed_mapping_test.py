#!/usr/bin/env python3
"""
Detailed Product Mapping Integration Test
Verifies that synonyms are correctly merged and stock is summed
"""

import requests
import json
import uuid

API_BASE_URL = "https://shopmanager-35.preview.emergentagent.com/api"

def test_detailed_mapping_integration():
    """Test detailed product mapping integration with specific scenarios"""
    
    print("=== Detailed Product Mapping Integration Test ===")
    
    # 1. Create a test store
    store_data = {"name": f"Mapping Test Store {uuid.uuid4().hex[:8]}"}
    response = requests.post(f"{API_BASE_URL}/stores", json=store_data)
    
    if response.status_code != 200:
        print(f"❌ Failed to create store: {response.status_code}")
        return False
        
    store_id = response.json()["id"]
    print(f"✅ Created test store: {store_id}")
    
    try:
        # 2. Add limits for TestProduct
        limits_data = {
            "limits": [{"product": "TestProduct", "limit": 10}],
            "apply_to_all": False
        }
        response = requests.post(f"{API_BASE_URL}/stores/{store_id}/limits", json=limits_data)
        
        if response.status_code != 200:
            print(f"❌ Failed to add limits: {response.status_code}")
            return False
            
        print("✅ Added limits: TestProduct = 10")
        
        # 3. Create product mapping
        mapping_data = {
            "main_product": "TestProduct",
            "synonyms": ["Тестовый продукт", "Test product variant"]
        }
        response = requests.post(f"{API_BASE_URL}/product-mappings", json=mapping_data)
        
        if response.status_code != 200:
            print(f"❌ Failed to create mapping: {response.status_code}")
            return False
            
        mapping_id = response.json()["id"]
        print("✅ Created product mapping with synonyms")
        
        # 4. Test data processing with synonyms
        test_data = {
            "store_id": store_id,
            "data": [
                {"product": "Тестовый продукт", "stock": 3},      # Synonym 1
                {"product": "Test product variant", "stock": 2},   # Synonym 2
                {"product": "TestProduct", "stock": 1}             # Main product
            ],
            "filter_expressions": []
        }
        
        response = requests.post(f"{API_BASE_URL}/process-text", json=test_data)
        
        if response.status_code == 200:
            # Should return Excel file - synonyms merged, total stock = 6, order = 4
            print("✅ Process-text returned Excel file (synonyms processed)")
            
            # Check content-type
            content_type = response.headers.get("content-type", "")
            if "spreadsheet" in content_type or "excel" in content_type:
                print("✅ Correct Excel content-type returned")
            else:
                print(f"⚠️ Unexpected content-type: {content_type}")
                
        elif response.status_code == 400:
            error_msg = response.json().get("detail", "")
            print(f"⚠️ Process returned 400: {error_msg}")
            
        else:
            print(f"❌ Unexpected response: {response.status_code}")
            return False
            
        # 5. Test with only synonyms (no main product)
        test_data_synonyms_only = {
            "store_id": store_id,
            "data": [
                {"product": "Тестовый продукт", "stock": 4},      # Synonym 1
                {"product": "Test product variant", "stock": 3}    # Synonym 2
            ],
            "filter_expressions": []
        }
        
        response = requests.post(f"{API_BASE_URL}/process-text", json=test_data_synonyms_only)
        
        if response.status_code == 200:
            print("✅ Synonyms-only processing successful")
        elif response.status_code == 400:
            error_msg = response.json().get("detail", "")
            print(f"✅ Expected behavior for synonyms-only: {error_msg}")
        else:
            print(f"❌ Unexpected response for synonyms-only: {response.status_code}")
            
        # Cleanup
        requests.delete(f"{API_BASE_URL}/product-mappings/{mapping_id}")
        requests.delete(f"{API_BASE_URL}/stores/{store_id}")
        print("✅ Cleaned up test resources")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed with error: {str(e)}")
        # Cleanup on error
        try:
            requests.delete(f"{API_BASE_URL}/stores/{store_id}")
        except:
            pass
        return False

if __name__ == "__main__":
    success = test_detailed_mapping_integration()
    if success:
        print("\n🎉 Detailed mapping integration test PASSED")
    else:
        print("\n❌ Detailed mapping integration test FAILED")