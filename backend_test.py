#!/usr/bin/env python3
"""
Backend API Testing for Order Calculator Application
Focus: Product Mappings feature and integration testing
"""

import requests
import json
import sys
from typing import Dict, List, Any
import uuid

# Get API URL from frontend .env
API_BASE_URL = "https://stock-limits-app.preview.emergentagent.com/api"

class OrderCalculatorTester:
    def __init__(self):
        self.base_url = API_BASE_URL
        self.test_store_id = None
        self.test_mapping_id = None
        self.created_resources = []  # Track resources for cleanup
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        print(f"[{level}] {message}")
        
    def make_request(self, method: str, endpoint: str, data: Dict = None, files: Dict = None) -> Dict:
        """Make HTTP request and return response"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            if method == "GET":
                response = requests.get(url, timeout=30)
            elif method == "POST":
                if files:
                    response = requests.post(url, files=files, data=data, timeout=30)
                else:
                    response = requests.post(url, json=data, timeout=30)
            elif method == "PUT":
                response = requests.put(url, json=data, timeout=30)
            elif method == "DELETE":
                response = requests.delete(url, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            self.log(f"{method} {endpoint} -> {response.status_code}")
            
            if response.status_code >= 400:
                self.log(f"Error response: {response.text}", "ERROR")
                
            return {
                "status_code": response.status_code,
                "data": response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text,
                "headers": dict(response.headers)
            }
            
        except requests.exceptions.RequestException as e:
            self.log(f"Request failed: {str(e)}", "ERROR")
            return {"status_code": 0, "data": {"error": str(e)}, "headers": {}}
        except Exception as e:
            self.log(f"Unexpected error: {str(e)}", "ERROR")
            return {"status_code": 0, "data": {"error": str(e)}, "headers": {}}

    def test_api_health(self) -> bool:
        """Test basic API connectivity"""
        self.log("=== Testing API Health ===")
        
        response = self.make_request("GET", "/")
        if response["status_code"] == 200:
            self.log("✅ API is accessible")
            return True
        else:
            self.log("❌ API is not accessible", "ERROR")
            return False

    def test_product_mappings_crud(self) -> bool:
        """Test Product Mappings CRUD operations"""
        self.log("=== Testing Product Mappings CRUD ===")
        
        success = True
        
        # 1. Test GET /api/product-mappings (list all)
        self.log("Testing GET /api/product-mappings")
        response = self.make_request("GET", "/product-mappings")
        if response["status_code"] != 200:
            self.log("❌ Failed to get product mappings list", "ERROR")
            success = False
        else:
            self.log("✅ Successfully retrieved product mappings list")
            
        # 2. Test POST /api/product-mappings (create)
        self.log("Testing POST /api/product-mappings")
        test_mapping = {
            "main_product": "TestProduct",
            "synonyms": ["Тестовый продукт", "Test product variant", "Тест товар"]
        }
        
        response = self.make_request("POST", "/product-mappings", test_mapping)
        if response["status_code"] != 200:
            self.log("❌ Failed to create product mapping", "ERROR")
            success = False
        else:
            self.log("✅ Successfully created product mapping")
            self.test_mapping_id = response["data"]["id"]
            self.created_resources.append(("mapping", self.test_mapping_id))
            
        # 3. Test PUT /api/product-mappings/{id} (update)
        if self.test_mapping_id:
            self.log("Testing PUT /api/product-mappings/{id}")
            update_data = {
                "synonyms": ["Тестовый продукт", "Test product variant", "Тест товар", "Updated synonym"]
            }
            
            response = self.make_request("PUT", f"/product-mappings/{self.test_mapping_id}", update_data)
            if response["status_code"] != 200:
                self.log("❌ Failed to update product mapping", "ERROR")
                success = False
            else:
                self.log("✅ Successfully updated product mapping")
                
        # 4. Test duplicate main_product validation
        self.log("Testing duplicate main_product validation")
        duplicate_mapping = {
            "main_product": "TestProduct",  # Same as above
            "synonyms": ["Another synonym"]
        }
        
        response = self.make_request("POST", "/product-mappings", duplicate_mapping)
        if response["status_code"] != 400:
            self.log("❌ Duplicate validation not working properly", "ERROR")
            success = False
        else:
            self.log("✅ Duplicate validation working correctly")
            
        return success

    def test_store_operations(self) -> bool:
        """Test store creation and update operations"""
        self.log("=== Testing Store Operations ===")
        
        success = True
        
        # 1. Test GET /api/stores
        self.log("Testing GET /api/stores")
        response = self.make_request("GET", "/stores")
        if response["status_code"] != 200:
            self.log("❌ Failed to get stores list", "ERROR")
            success = False
        else:
            self.log("✅ Successfully retrieved stores list")
            
        # 2. Create test store
        self.log("Testing POST /api/stores")
        test_store = {
            "name": f"Test Store {uuid.uuid4().hex[:8]}"
        }
        
        response = self.make_request("POST", "/stores", test_store)
        if response["status_code"] != 200:
            self.log("❌ Failed to create test store", "ERROR")
            success = False
        else:
            self.log("✅ Successfully created test store")
            self.test_store_id = response["data"]["id"]
            self.created_resources.append(("store", self.test_store_id))
            
        # 3. Add limits to store
        if self.test_store_id:
            self.log("Testing POST /api/stores/{id}/limits")
            limits_data = {
                "limits": [
                    {"product": "TestProduct", "limit": 10},
                    {"product": "AnotherProduct", "limit": 5}
                ],
                "apply_to_all": False
            }
            
            response = self.make_request("POST", f"/stores/{self.test_store_id}/limits", limits_data)
            if response["status_code"] != 200:
                self.log("❌ Failed to add limits to store", "ERROR")
                success = False
            else:
                self.log("✅ Successfully added limits to store")
                
        # 4. Test store name update (inline editing)
        if self.test_store_id:
            self.log("Testing PUT /api/stores/{id} (inline name editing)")
            update_data = {
                "name": f"Updated Test Store {uuid.uuid4().hex[:8]}"
            }
            
            response = self.make_request("PUT", f"/stores/{self.test_store_id}", update_data)
            if response["status_code"] != 200:
                self.log("❌ Failed to update store name", "ERROR")
                success = False
            else:
                self.log("✅ Successfully updated store name")
                
        return success

    def test_product_mapping_integration(self) -> bool:
        """Test product mapping integration in order processing"""
        self.log("=== Testing Product Mapping Integration ===")
        
        if not self.test_store_id or not self.test_mapping_id:
            self.log("❌ Missing test store or mapping - skipping integration test", "ERROR")
            return False
            
        success = True
        
        # Test /api/process-text endpoint with synonyms
        self.log("Testing /api/process-text with product synonyms")
        
        # Create test data with synonyms that should merge
        test_data = {
            "store_id": self.test_store_id,
            "data": [
                {"product": "Тестовый продукт", "stock": 3},  # Synonym 1
                {"product": "Test product variant", "stock": 2},  # Synonym 2
                {"product": "AnotherProduct", "stock": 1}  # Regular product
            ],
            "filter_expressions": []
        }
        
        response = self.make_request("POST", "/process-text", test_data)
        
        # Check if we get a proper response (Excel file or error message)
        if response["status_code"] == 200:
            # Should return Excel file
            content_type = response["headers"].get("content-type", "")
            if "spreadsheet" in content_type or "excel" in content_type:
                self.log("✅ Successfully processed text data with product mappings (Excel returned)")
            else:
                self.log("⚠️ Unexpected response format for process-text", "WARNING")
        elif response["status_code"] == 400:
            # Might be expected if no orders to place
            error_msg = response["data"].get("detail", "")
            if "Не найдено товаров для заказа" in error_msg:
                self.log("✅ Product mapping integration working (no orders needed)")
            else:
                self.log(f"❌ Unexpected error in process-text: {error_msg}", "ERROR")
                success = False
        else:
            self.log(f"❌ Failed to process text data: {response['status_code']}", "ERROR")
            success = False
            
        return success

    def test_filters_api(self) -> bool:
        """Test filters API (regression test)"""
        self.log("=== Testing Filters API (Regression) ===")
        
        response = self.make_request("GET", "/filters")
        if response["status_code"] != 200:
            self.log("❌ Failed to get filters list", "ERROR")
            return False
        else:
            self.log("✅ Filters API working correctly")
            return True

    def cleanup_resources(self):
        """Clean up created test resources"""
        self.log("=== Cleaning Up Test Resources ===")
        
        for resource_type, resource_id in reversed(self.created_resources):
            if resource_type == "mapping":
                response = self.make_request("DELETE", f"/product-mappings/{resource_id}")
                if response["status_code"] == 200:
                    self.log(f"✅ Deleted test mapping {resource_id}")
                else:
                    self.log(f"⚠️ Failed to delete test mapping {resource_id}", "WARNING")
                    
            elif resource_type == "store":
                response = self.make_request("DELETE", f"/stores/{resource_id}")
                if response["status_code"] == 200:
                    self.log(f"✅ Deleted test store {resource_id}")
                else:
                    self.log(f"⚠️ Failed to delete test store {resource_id}", "WARNING")

    def run_all_tests(self) -> Dict[str, bool]:
        """Run all tests and return results"""
        results = {}
        
        try:
            # Test API connectivity first
            results["api_health"] = self.test_api_health()
            if not results["api_health"]:
                self.log("❌ API not accessible - stopping tests", "ERROR")
                return results
                
            # Run main tests
            results["product_mappings_crud"] = self.test_product_mappings_crud()
            results["store_operations"] = self.test_store_operations()
            results["product_mapping_integration"] = self.test_product_mapping_integration()
            results["filters_regression"] = self.test_filters_api()
            
        except Exception as e:
            self.log(f"❌ Unexpected error during testing: {str(e)}", "ERROR")
            results["unexpected_error"] = False
            
        finally:
            # Always try to clean up
            self.cleanup_resources()
            
        return results

def main():
    """Main test execution"""
    print("=" * 60)
    print("Order Calculator Backend API Tests")
    print(f"API Base URL: {API_BASE_URL}")
    print("=" * 60)
    
    tester = OrderCalculatorTester()
    results = tester.run_all_tests()
    
    # Print summary
    print("\n" + "=" * 60)
    print("TEST RESULTS SUMMARY")
    print("=" * 60)
    
    total_tests = len(results)
    passed_tests = sum(1 for result in results.values() if result)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{test_name}: {status}")
        
    print(f"\nOverall: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️ Some tests failed - check logs above")
        return 1

if __name__ == "__main__":
    sys.exit(main())