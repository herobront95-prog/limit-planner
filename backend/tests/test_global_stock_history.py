#!/usr/bin/env python3
"""
Backend API Testing for Order Calculator Application
Focus: Global Stock and History features
"""

import requests
import json
import sys
import io
import pandas as pd
from typing import Dict, List, Any
import uuid
import tempfile
import os
from urllib.parse import quote

# Get API URL from frontend .env
API_BASE_URL = "https://stock-limits-app.preview.emergentagent.com/api"

class GlobalStockHistoryTester:
    def __init__(self):
        self.base_url = API_BASE_URL
        self.test_store_id = None
        self.test_order_id = None
        self.created_resources = []  # Track resources for cleanup
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        print(f"[{level}] {message}")
        
    def make_request(self, method: str, endpoint: str, data: Dict = None, files: Dict = None, params: Dict = None) -> Dict:
        """Make HTTP request and return response"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            if method == "GET":
                response = requests.get(url, params=params, timeout=30)
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
                
            # Handle different content types
            content_type = response.headers.get('content-type', '')
            if 'application/json' in content_type:
                response_data = response.json()
            elif 'spreadsheet' in content_type or 'excel' in content_type:
                response_data = {"excel_content": True, "content_length": len(response.content)}
            else:
                response_data = response.text
                
            return {
                "status_code": response.status_code,
                "data": response_data,
                "headers": dict(response.headers),
                "content": response.content if 'spreadsheet' in content_type or 'excel' in content_type else None
            }
            
        except requests.exceptions.RequestException as e:
            self.log(f"Request failed: {str(e)}", "ERROR")
            return {"status_code": 0, "data": {"error": str(e)}, "headers": {}}
        except Exception as e:
            self.log(f"Unexpected error: {str(e)}", "ERROR")
            return {"status_code": 0, "data": {"error": str(e)}, "headers": {}}

    def create_test_excel_file(self) -> str:
        """Create a test Excel file for global stock upload"""
        # Create test data with format: Товар | Store1 | Store2 | Store3
        data = {
            'Товар': ['Молоко 1л', 'Хлеб белый', 'Масло сливочное', 'Сыр российский'],
            'Магазин Центр': [15, 25, 8, 12],
            'Магазин Север': [20, 30, 10, 15],
            'Магазин Юг': [18, 22, 6, 9]
        }
        
        df = pd.DataFrame(data)
        
        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        df.to_excel(temp_file.name, index=False, engine='openpyxl')
        temp_file.close()
        
        return temp_file.name

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

    def setup_test_store(self) -> bool:
        """Create a test store for testing"""
        self.log("=== Setting Up Test Store ===")
        
        # Create test store
        test_store = {
            "name": f"Test Store {uuid.uuid4().hex[:8]}"
        }
        
        response = self.make_request("POST", "/stores", test_store)
        if response["status_code"] != 200:
            self.log("❌ Failed to create test store", "ERROR")
            return False
        
        self.test_store_id = response["data"]["id"]
        self.created_resources.append(("store", self.test_store_id))
        
        # Add some limits to the store
        limits_data = {
            "limits": [
                {"product": "Молоко 1л", "limit": 20},
                {"product": "Хлеб белый", "limit": 30},
                {"product": "Масло сливочное", "limit": 10},
                {"product": "Сыр российский", "limit": 15}
            ],
            "apply_to_all": False
        }
        
        response = self.make_request("POST", f"/stores/{self.test_store_id}/limits", limits_data)
        if response["status_code"] != 200:
            self.log("❌ Failed to add limits to test store", "ERROR")
            return False
            
        self.log("✅ Test store created successfully")
        return True

    def test_global_stock_upload(self) -> bool:
        """Test Global Stock Upload API"""
        self.log("=== Testing Global Stock Upload API ===")
        
        success = True
        
        # Create test Excel file
        excel_file_path = self.create_test_excel_file()
        
        try:
            # Test POST /api/global-stock/upload
            self.log("Testing POST /api/global-stock/upload")
            
            with open(excel_file_path, 'rb') as f:
                files = {'file': ('test_stock.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
                response = self.make_request("POST", "/global-stock/upload", files=files)
            
            if response["status_code"] != 200:
                self.log("❌ Failed to upload global stock file", "ERROR")
                success = False
            else:
                self.log("✅ Successfully uploaded global stock file")
                data = response["data"]
                if "products_count" in data and "stores_found" in data:
                    self.log(f"   Products: {data['products_count']}, Stores: {data['stores_found']}")
                else:
                    self.log("⚠️ Response missing expected fields", "WARNING")
                    
        finally:
            # Clean up temp file
            os.unlink(excel_file_path)
            
        return success

    def test_global_stock_retrieval(self) -> bool:
        """Test Global Stock Retrieval APIs"""
        self.log("=== Testing Global Stock Retrieval APIs ===")
        
        success = True
        
        # Test GET /api/global-stock/latest
        self.log("Testing GET /api/global-stock/latest")
        response = self.make_request("GET", "/global-stock/latest")
        
        if response["status_code"] != 200:
            self.log("❌ Failed to get latest global stock", "ERROR")
            success = False
        else:
            latest_stock = response["data"]
            if latest_stock is None:
                self.log("⚠️ No global stock data found", "WARNING")
            else:
                self.log("✅ Successfully retrieved latest global stock")
                if "data" in latest_stock and "store_columns" in latest_stock:
                    self.log(f"   Store columns: {latest_stock['store_columns']}")
                else:
                    self.log("⚠️ Latest stock missing expected fields", "WARNING")
        
        # Test GET /api/global-stock/history
        self.log("Testing GET /api/global-stock/history")
        response = self.make_request("GET", "/global-stock/history")
        
        if response["status_code"] != 200:
            self.log("❌ Failed to get global stock history", "ERROR")
            success = False
        else:
            self.log("✅ Successfully retrieved global stock history")
            history = response["data"]
            if isinstance(history, list):
                self.log(f"   Found {len(history)} history records")
            else:
                self.log("⚠️ History response not a list", "WARNING")
                
        return success

    def test_process_with_global_stock(self) -> bool:
        """Test processing order from global stock"""
        self.log("=== Testing Process with Global Stock ===")
        
        if not self.test_store_id:
            self.log("❌ No test store available", "ERROR")
            return False
            
        success = True
        
        # Test POST /api/process-text with use_global_stock=true
        self.log("Testing POST /api/process-text with use_global_stock=true")
        
        test_data = {
            "store_id": self.test_store_id,
            "data": [],  # Empty data since we're using global stock
            "use_global_stock": True,
            "filter_expressions": []
        }
        
        response = self.make_request("POST", "/process-text", test_data)
        
        if response["status_code"] == 200:
            # Should return Excel file
            content_type = response["headers"].get("content-type", "")
            if "spreadsheet" in content_type or "excel" in content_type:
                self.log("✅ Successfully processed order from global stock (Excel returned)")
            else:
                self.log("⚠️ Unexpected response format for process with global stock", "WARNING")
        elif response["status_code"] == 400:
            # Might be expected if no global stock or no orders needed
            error_msg = response["data"].get("detail", "")
            if "Нет загруженных общих остатков" in error_msg:
                self.log("⚠️ No global stock available for processing", "WARNING")
            elif "Не найдено товаров для заказа" in error_msg:
                self.log("✅ Global stock processing working (no orders needed)")
            else:
                self.log(f"❌ Unexpected error in process with global stock: {error_msg}", "ERROR")
                success = False
        else:
            self.log(f"❌ Failed to process with global stock: {response['status_code']}", "ERROR")
            success = False
            
        return success

    def test_order_history_api(self) -> bool:
        """Test Order History APIs"""
        self.log("=== Testing Order History APIs ===")
        
        if not self.test_store_id:
            self.log("❌ No test store available", "ERROR")
            return False
            
        success = True
        
        # Test GET /api/stores/{store_id}/orders
        self.log("Testing GET /api/stores/{store_id}/orders")
        response = self.make_request("GET", f"/stores/{self.test_store_id}/orders")
        
        if response["status_code"] != 200:
            self.log("❌ Failed to get store orders", "ERROR")
            success = False
        else:
            self.log("✅ Successfully retrieved store orders")
            orders = response["data"]
            if isinstance(orders, list):
                self.log(f"   Found {len(orders)} orders")
                if len(orders) > 0:
                    # Test order details and download for first order
                    first_order = orders[0]
                    self.test_order_id = first_order.get("id")
                    
                    if self.test_order_id:
                        # Test GET /api/stores/{store_id}/orders/{order_id}
                        self.log("Testing GET /api/stores/{store_id}/orders/{order_id}")
                        response = self.make_request("GET", f"/stores/{self.test_store_id}/orders/{self.test_order_id}")
                        
                        if response["status_code"] != 200:
                            self.log("❌ Failed to get order details", "ERROR")
                            success = False
                        else:
                            self.log("✅ Successfully retrieved order details")
                            order_details = response["data"]
                            if "items" in order_details:
                                self.log(f"   Order has {len(order_details['items'])} items")
                            
                        # Test order download
                        success = success and self.test_order_download()
            else:
                self.log("⚠️ Orders response not a list", "WARNING")
                
        return success

    def test_order_download(self) -> bool:
        """Test order download with formatting verification"""
        self.log("=== Testing Order Download Formatting ===")
        
        if not self.test_store_id or not self.test_order_id:
            self.log("❌ No test store or order available", "ERROR")
            return False
            
        success = True
        
        # Test GET /api/stores/{store_id}/orders/{order_id}/download
        self.log("Testing GET /api/stores/{store_id}/orders/{order_id}/download")
        response = self.make_request("GET", f"/stores/{self.test_store_id}/orders/{self.test_order_id}/download")
        
        if response["status_code"] != 200:
            self.log("❌ Failed to download order", "ERROR")
            success = False
        else:
            content_type = response["headers"].get("content-type", "")
            if "spreadsheet" in content_type or "excel" in content_type:
                self.log("✅ Successfully downloaded order as Excel")
                
                # Verify Excel formatting
                if response["content"]:
                    try:
                        # Read Excel content to verify format
                        excel_data = pd.read_excel(io.BytesIO(response["content"]))
                        columns = list(excel_data.columns)
                        
                        self.log(f"   Excel columns: {columns}")
                        
                        # Verify formatting requirements
                        if len(columns) == 2:
                            self.log("✅ Correct number of columns (2)")
                            
                            # Check if second column is "Заказ"
                            if columns[1] == "Заказ":
                                self.log("✅ Second column correctly named 'Заказ'")
                            else:
                                self.log(f"❌ Second column should be 'Заказ', got '{columns[1]}'", "ERROR")
                                success = False
                                
                            # First column should be store name (not "Товар")
                            if columns[0] != "Товар":
                                self.log(f"✅ First column named after store: '{columns[0]}'")
                            else:
                                self.log("❌ First column should be store name, not 'Товар'", "ERROR")
                                success = False
                        else:
                            self.log(f"❌ Expected 2 columns, got {len(columns)}", "ERROR")
                            success = False
                            
                    except Exception as e:
                        self.log(f"❌ Failed to parse downloaded Excel: {str(e)}", "ERROR")
                        success = False
                else:
                    self.log("⚠️ No Excel content received", "WARNING")
            else:
                self.log("❌ Download did not return Excel file", "ERROR")
                success = False
                
        return success

    def test_stock_history_api(self) -> bool:
        """Test Stock History APIs"""
        self.log("=== Testing Stock History APIs ===")
        
        if not self.test_store_id:
            self.log("❌ No test store available", "ERROR")
            return False
            
        success = True
        
        # Test GET /api/stores/{store_id}/stock-history with different periods
        periods = ["day", "week", "month", "year"]
        
        for period in periods:
            self.log(f"Testing GET /api/stores/{{store_id}}/stock-history?period={period}")
            response = self.make_request("GET", f"/stores/{self.test_store_id}/stock-history", params={"period": period})
            
            if response["status_code"] != 200:
                self.log(f"❌ Failed to get stock history for period {period}", "ERROR")
                success = False
            else:
                self.log(f"✅ Successfully retrieved stock history for period {period}")
                history = response["data"]
                if "products" in history and "period" in history:
                    self.log(f"   Found {len(history['products'])} products for {history['period']} period")
                else:
                    self.log("⚠️ Stock history missing expected fields", "WARNING")
        
        # Test specific product history
        self.log("Testing GET /api/stores/{store_id}/stock-history/{product}")
        
        # Use a test product
        test_product = "Молоко 1л"
        encoded_product = quote(test_product)
        
        response = self.make_request("GET", f"/stores/{self.test_store_id}/stock-history/{encoded_product}", params={"period": "week"})
        
        if response["status_code"] != 200:
            self.log("❌ Failed to get specific product stock history", "ERROR")
            success = False
        else:
            self.log("✅ Successfully retrieved specific product stock history")
            product_history = response["data"]
            if "stock_history" in product_history and "order_history" in product_history:
                stock_records = product_history["stock_history"]
                order_records = product_history["order_history"]
                self.log(f"   Stock records: {len(stock_records)}, Order records: {len(order_records)}")
            else:
                self.log("⚠️ Product history missing expected fields", "WARNING")
                
        return success

    def cleanup_resources(self):
        """Clean up created test resources"""
        self.log("=== Cleaning Up Test Resources ===")
        
        for resource_type, resource_id in reversed(self.created_resources):
            if resource_type == "store":
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
                
            # Setup test store
            results["setup_test_store"] = self.setup_test_store()
            if not results["setup_test_store"]:
                self.log("❌ Failed to setup test store - some tests may fail", "ERROR")
                
            # Run main tests
            results["global_stock_upload"] = self.test_global_stock_upload()
            results["global_stock_retrieval"] = self.test_global_stock_retrieval()
            results["process_with_global_stock"] = self.test_process_with_global_stock()
            results["order_history_api"] = self.test_order_history_api()
            results["stock_history_api"] = self.test_stock_history_api()
            
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
    print("Order Calculator Global Stock & History API Tests")
    print(f"API Base URL: {API_BASE_URL}")
    print("=" * 60)
    
    tester = GlobalStockHistoryTester()
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