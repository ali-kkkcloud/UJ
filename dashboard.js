// 🚀 GITHUB VEHICLE DASHBOARD - COMPLETE FUNCTIONALITY RESTORED
// All original .gs script features + Google Sheets API integration

class VehicleDashboard {
    constructor() {
        this.apiKey = '';
        this.sheetId = '';
        this.ranges = [];
        this.cache = {};
        this.charts = {};
        this.loadStartTime = Date.now();
        this.debounceTimer = null;
        
        this.init();
    }
    
    init() {
        console.log('🚀 Initializing Complete Vehicle Dashboard...');
        this.loadConfig();
        this.setupEventListeners();
        this.updateSpeed('Initializing...');
        
        if (this.apiKey && this.sheetId) {
            this.hideConfigModal();
            this.startLoading();
        } else {
            this.showConfigModal();
        }
    }
    
    // =================== CONFIGURATION ===================
    
    loadConfig() {
        const config = localStorage.getItem('vehicleDashboardConfig');
        if (config) {
            const parsed = JSON.parse(config);
            this.apiKey = parsed.apiKey || '';
            this.sheetId = parsed.sheetId || '1P1OWqjFKjmV9cxbdQAxsO-d6SIvTvrEfwbOOkdqqe0Q';
            this.ranges = parsed.ranges || [];
            
            // Update form fields
            document.getElementById('apiKey').value = this.apiKey;
            document.getElementById('sheetId').value = this.sheetId;
            document.getElementById('ranges').value = this.ranges.length > 0 ? this.ranges.join(',') : 'Leave empty for auto-detection';
        } else {
            // Set defaults for first time
            this.sheetId = '1P1OWqjFKjmV9cxbdQAxsO-d6SIvTvrEfwbOOkdqqe0Q';
            this.ranges = [];
            document.getElementById('sheetId').value = this.sheetId;
            document.getElementById('ranges').value = 'Leave empty for auto-detection';
        }
    }
    
    saveConfig() {
        const apiKey = document.getElementById('apiKey').value.trim();
        const sheetId = document.getElementById('sheetId').value.trim();
        const rangesText = document.getElementById('ranges').value.trim();
        
        if (!apiKey || !sheetId) {
            this.showError('Please enter both API Key and Sheet ID');
            return;
        }
        
        this.apiKey = apiKey;
        this.sheetId = sheetId;
        
        // Handle ranges - empty means auto-detection
        if (rangesText && rangesText !== 'Leave empty for auto-detection') {
            this.ranges = rangesText.split(',').map(r => r.trim());
        } else {
            this.ranges = []; // Empty means auto-detect
        }
        
        const config = {
            apiKey: this.apiKey,
            sheetId: this.sheetId,
            ranges: this.ranges
        };
        
        localStorage.setItem('vehicleDashboardConfig', JSON.stringify(config));
        
        this.hideConfigModal();
        this.startLoading();
    }
    
    showConfigModal() {
        document.getElementById('configModal').style.display = 'flex';
    }
    
    hideConfigModal() {
        document.getElementById('configModal').style.display = 'none';
    }
    
    // =================== GOOGLE SHEETS API ===================
    
    async fetchSheetData() {
        if (!this.apiKey || !this.sheetId) {
            throw new Error('API Key and Sheet ID are required');
        }
        
        try {
            this.updateLoadingStatus('Connecting to Google Sheets...');
            
            // First, get all sheet names automatically
            const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}?key=${this.apiKey}`;
            const metadataResponse = await fetch(metadataUrl);
            
            if (!metadataResponse.ok) {
                throw new Error('Failed to fetch sheet metadata');
            }
            
            const metadata = await metadataResponse.json();
            const allSheets = metadata.sheets || [];
            
            // Auto-detected ranges with better filtering for daily tabs
            const autoRanges = allSheets
                .filter(sheet => {
                    const name = sheet.properties.title.toLowerCase();
                    // Filter only daily tabs (ignore any other sheets)
                    return /\d+(st|nd|rd|th)\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(name) ||
                           /\d+\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(name);
                })
                .map(sheet => `${sheet.properties.title}!A:J`);
            
            const sheetNames = allSheets.map(s => s.properties.title).filter(name => {
                const nameLower = name.toLowerCase();
                return /\d+(st|nd|rd|th)\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(nameLower) ||
                       /\d+\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(nameLower);
            });
            
            console.log('🔍 Auto-detected daily sheets:', sheetNames);
            console.log('📊 Total sheets found:', sheetNames.length);
            
            // Use auto-detected ranges or fallback to user-provided ranges
            const rangesToUse = autoRanges.length > 0 ? autoRanges : this.ranges;
            
            this.updateLoadingStatus(`Processing ${sheetNames.length} daily tabs...`);
            
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}/values:batchGet?ranges=${rangesToUse.join('&ranges=')}&key=${this.apiKey}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Google Sheets API Error: ${errorData.error?.message || response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ Google Sheets data fetched successfully');
            
            // Store sheet metadata for processing
            this.sheetMetadata = allSheets;
            
            return this.processSheetData(data);
            
        } catch (error) {
            console.error('❌ Error fetching sheet data:', error);
            throw error;
        }
    }
    
    processSheetData(apiResponse) {
        this.updateLoadingStatus('Processing vehicle data...');
        
        const allVehicles = [];
        let activeVehicles = {};        // Track active vehicles by month
        let offlineVehicles = {};       // Track offline vehicles by month  
        let alignmentTimelines = {};    // Track alignment changes by month
        let monthlyData = {};           // Track all months found
        let clientAnalysis = {};        // Track vehicles by client (latest date only)
        let cityAnalysis = {};          // Track vehicles by city (latest date only)
        let latestDate = '';            // Track the most recent date found
        let latestDateSortKey = '';
        
        // Column mapping (same as original script)
        const COLUMNS = {
            date: 0,        // Column A
            location: 1,    // Column B  
            vehicle: 2,     // Column C
            client: 3,      // Column D
            type: 4,        // Column E
            installation: 5, // Column F
            status: 6,      // Column G (Working Status)
            recording: 7,   // Column H
            alignment: 8,   // Column I (Alignment Status)
            remarks: 9      // Column J
        };
        
        // UTILITY FUNCTIONS - Exact same as original .gs script
        const cleanText = (text) => {
            if (!text) return '';
            return text.toString()
                .replace(/\*\*/g, '')
                .replace(/^\s+|\s+$/g, '')
                .replace(/\s+/g, ' ');
        };
        
        const formatDate = (dateInput) => {
            try {
                const dateStr = dateInput.toString();
                
                // Handle tab names like "26th July", "1st August"
                const tabDateMatch = dateStr.match(/(\d+)(st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i);
                if (tabDateMatch) {
                    const day = tabDateMatch[1];
                    const month = tabDateMatch[3];
                    return day + ' ' + month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
                }
                
                if (dateStr.includes('-')) {
                    const parts = dateStr.split('-');
                    if (parts.length >= 2) {
                        return parts[0] + ' ' + parts[1];
                    }
                }
                
                if (dateInput instanceof Date) {
                    const day = dateInput.getDate();
                    const month = dateInput.toLocaleString('en-US', { month: 'long' });
                    return day + ' ' + month;
                }
                
                const dayMatch = dateStr.match(/\d+/);
                const monthMatch = dateStr.match(/january|february|march|april|may|june|july|august|september|october|november|december/i);
                
                if (dayMatch && monthMatch) {
                    return dayMatch[0] + ' ' + monthMatch[0];
                }
                
                return dateStr.replace(/[^\w\s]/g, '').trim();
                
            } catch (error) {
                return dateInput.toString();
            }
        };
        
        const getDateSortKey = (dateStr) => {
            try {
                const parts = dateStr.split(' ');
                if (parts.length >= 2) {
                    const day = parseInt(parts[0]) || 0;
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                       'July', 'August', 'September', 'October', 'November', 'December'];
                    const monthIndex = monthNames.indexOf(parts[1]) + 1 || 0;
                    return monthIndex.toString().padStart(2, '0') + '-' + day.toString().padStart(2, '0');
                }
                return dateStr;
            } catch (error) {
                return dateStr;
            }
        };
        
        const getMonth = (sheetName, dateStr) => {
            const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                           'july', 'august', 'september', 'october', 'november', 'december'];
            
            const tabLower = sheetName.toLowerCase();
            const dateLower = dateStr.toLowerCase();
            
            // Handle daily tabs like "26th July", "1st August", etc.
            for (let month of months) {
                if (tabLower.includes(month) || dateLower.includes(month)) {
                    return month.charAt(0).toUpperCase() + month.slice(1);
                }
            }
            
            // Enhanced month detection from tab names
            if (tabLower.includes('july') || tabLower.includes('jul')) return 'July';
            if (tabLower.includes('august') || tabLower.includes('aug')) return 'August';
            if (tabLower.includes('september') || tabLower.includes('sep')) return 'September';
            if (tabLower.includes('october') || tabLower.includes('oct')) return 'October';
            if (tabLower.includes('november') || tabLower.includes('nov')) return 'November';
            if (tabLower.includes('december') || tabLower.includes('dec')) return 'December';
            if (tabLower.includes('january') || tabLower.includes('jan')) return 'January';
            if (tabLower.includes('february') || tabLower.includes('feb')) return 'February';
            if (tabLower.includes('march') || tabLower.includes('mar')) return 'March';
            if (tabLower.includes('april') || tabLower.includes('apr')) return 'April';
            if (tabLower.includes('may')) return 'May';
            if (tabLower.includes('june') || tabLower.includes('jun')) return 'June';
            
            // Try to extract month from date string in the sheet
            const dateMatch = dateStr.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
            if (dateMatch) {
                return dateMatch[1].charAt(0).toUpperCase() + dateMatch[1].slice(1).toLowerCase();
            }
            
            // Try to extract month from numbers in date
            const numericMatch = dateStr.match(/\b(0?[1-9]|1[0-2])\b/);
            if (numericMatch) {
                const monthNum = parseInt(numericMatch[1]);
                const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                                   'July', 'August', 'September', 'October', 'November', 'December'];
                if (monthNum >= 1 && monthNum <= 12) {
                    return monthNames[monthNum];
                }
            }
            
            return 'Unknown';
        };
        
        // Add alignment timeline creation function (exact same as .gs script)
        const createAlignmentTimeline = (vehicleData) => {
            if (!vehicleData || vehicleData.length === 0) return 'No alignment data';
            
            // Sort chronologically
            vehicleData.sort(function(a, b) {
                return getDateSortKey(a.date).localeCompare(getDateSortKey(b.date));
            });
            
            var timeline = [];
            var currentStatus = '';
            var startDate = '';
            var endDate = '';
            
            for (var i = 0; i < vehicleData.length; i++) {
                var entry = vehicleData[i];
                var status = entry.alignmentStatus;
                
                // Skip if no proper alignment status
                if (!status || status === 'Unknown' || status === 'NA') continue;
                
                if (status !== currentStatus) {
                    // Save previous status period
                    if (currentStatus && startDate) {
                        var period = startDate === endDate ? startDate : startDate + ' to ' + endDate;
                        timeline.push(currentStatus + ' (' + period + ')');
                    }
                    
                    // Start new status period
                    currentStatus = status;
                    startDate = entry.date;
                    endDate = entry.date;
                } else {
                    // Continue current status period
                    endDate = entry.date;
                }
            }
            
            // Add final status period
            if (currentStatus && startDate) {
                var period = startDate === endDate ? startDate : startDate + ' to ' + endDate;
                timeline.push(currentStatus + ' (' + period + ')');
            }
            
            return timeline.length > 0 ? timeline.join(' → ') : 'No alignment changes';
        };
        
        // First pass: Find latest date
        apiResponse.valueRanges.forEach((range, sheetIndex) => {
            if (!range.values || range.values.length < 2) return;
            
            for (let i = 1; i < range.values.length; i++) {
                const row = range.values[i];
                const date = row[COLUMNS.date];
                
                if (date) {
                    const formattedDate = formatDate(date);
                    const sortKey = getDateSortKey(formattedDate);
                    if (sortKey > latestDateSortKey) {
                        latestDateSortKey = sortKey;
                        latestDate = formattedDate;
                    }
                }
            }
        });
        
        console.log(`📅 Latest date found: ${latestDate} (Sort key: ${latestDateSortKey})`);
        
        if (!latestDate) {
            console.log('⚠️ No latest date found, using current month approach');
            latestDate = 'Current';
        }
        
        // Second pass: Process all data
        apiResponse.valueRanges.forEach((range, sheetIndex) => {
            if (!range.values || range.values.length < 2) return;
            
            // Get actual sheet name from metadata or use generic name
            const sheetName = this.sheetMetadata && this.sheetMetadata[sheetIndex] 
                ? this.sheetMetadata[sheetIndex].properties.title 
                : `Sheet${sheetIndex + 1}`;
            
            console.log(`🔄 Processing ${sheetName}...`);
            
            for (let i = 1; i < range.values.length; i++) {
                const row = range.values[i];
                
                const date = row[COLUMNS.date];
                const vehicleNumber = cleanText(row[COLUMNS.vehicle]);
                const workingStatus = row[COLUMNS.status];
                const alignmentStatus = row[COLUMNS.alignment];
                const clientName = cleanText(row[COLUMNS.client]);
                const location = cleanText(row[COLUMNS.location]);
                const vehicleType = cleanText(row[COLUMNS.type]) || 'Bus';
                const installationDate = row[COLUMNS.installation];
                const recording = cleanText(row[COLUMNS.recording]);
                const remarks = cleanText(row[COLUMNS.remarks]);
                
                if (!date || !vehicleNumber || !workingStatus) continue;
                
                // Skip header-like rows with exact same logic as .gs script
                const vehicleLower = vehicleNumber.toLowerCase();
                if (vehicleLower.includes('vehicle') || 
                    vehicleLower.includes('chassis') ||
                    vehicleLower.includes('number') ||
                    vehicleNumber === '' ||
                    vehicleNumber.length < 3) {
                    console.log(`⚠️ Skipping header row ${i}: ${vehicleNumber}`);
                    continue;
                }
                
                const formattedDate = formatDate(date);
                const month = getMonth(sheetName, date.toString());
                
                if (month === 'Unknown') continue;
                
                // Create vehicle object for allVehicles array
                const vehicleObj = {
                    vehicle: vehicleNumber,
                    client: clientName || 'Unknown',
                    location: location || 'Unknown',
                    workingStatus: workingStatus || 'Unknown',
                    alignmentStatus: alignmentStatus || 'Unknown',
                    vehicleType: vehicleType,
                    installationDate: installationDate ? formatDate(installationDate) : 'Unknown',
                    recording: recording || 'Unknown',
                    date: formattedDate,
                    remarks: remarks || '',
                    month: month,
                    sheetName: sheetName
                };
                
                allVehicles.push(vehicleObj);
                
                // Initialize month tracking - same as .gs script
                if (!monthlyData[month]) {
                    monthlyData[month] = new Set();
                    activeVehicles[month] = {};
                    offlineVehicles[month] = {};
                    alignmentTimelines[month] = {};
                }
                monthlyData[month].add(vehicleNumber);
                
                // TRACK ACTIVE VEHICLES - exact same logic
                if (!activeVehicles[month][vehicleNumber]) {
                    activeVehicles[month][vehicleNumber] = {
                        allActive: true,
                        statuses: []
                    };
                }
                
                activeVehicles[month][vehicleNumber].statuses.push({
                    date: formattedDate,
                    status: workingStatus
                });
                
                // Mark as not consistently active if any non-Active status
                if (workingStatus !== 'Active') {
                    activeVehicles[month][vehicleNumber].allActive = false;
                }
                
                // TRACK OFFLINE VEHICLES - exact same logic
                if (workingStatus === 'Offlline >24Hrs') {
                    if (!offlineVehicles[month][vehicleNumber]) {
                        offlineVehicles[month][vehicleNumber] = {
                            dates: [],
                            latestRemarks: ''
                        };
                    }
                    
                    offlineVehicles[month][vehicleNumber].dates.push(formattedDate);
                    offlineVehicles[month][vehicleNumber].latestRemarks = remarks || 'Offline';
                }
                
                // TRACK ALIGNMENT TIMELINE - exact same logic
                if (alignmentStatus && (alignmentStatus === 'Misalligned' || alignmentStatus === 'Alligned')) {
                    if (!alignmentTimelines[month][vehicleNumber]) {
                        alignmentTimelines[month][vehicleNumber] = [];
                    }
                    
                    alignmentTimelines[month][vehicleNumber].push({
                        date: formattedDate,
                        alignmentStatus: alignmentStatus,
                        remarks: remarks || ''
                    });
                }
                
                // PROCESS CLIENT & CITY ANALYSIS DATA - exact same logic as .gs script
                let shouldCollectForAnalysis = false;
                
                if (latestDate === 'Current') {
                    shouldCollectForAnalysis = true;
                } else {
                    shouldCollectForAnalysis = (formattedDate === latestDate) || 
                                              (getDateSortKey(formattedDate) === latestDateSortKey);
                }
                
                if (shouldCollectForAnalysis) {
                    // CLIENT ANALYSIS - exact same filtering logic
                    if (clientName && 
                        clientName.length > 0 && 
                        clientName !== '#N/A' && 
                        clientName !== 'NA' &&
                        !clientName.toLowerCase().includes('client name') &&
                        !clientName.toLowerCase().includes('vehicle number')) {
                        
                        if (!clientAnalysis[clientName]) {
                            clientAnalysis[clientName] = [];
                        }
                        
                        // Check if this vehicle already exists for this client (avoid duplicates)
                        const existingVehicle = clientAnalysis[clientName].find(function(v) {
                            return v.vehicle === vehicleNumber;
                        });
                        
                        if (!existingVehicle) {
                            clientAnalysis[clientName].push({
                                vehicle: vehicleNumber,
                                workingStatus: workingStatus,
                                alignmentStatus: alignmentStatus || 'Unknown',
                                location: location || 'Unknown',
                                remarks: remarks || '',
                                date: formattedDate
                            });
                        }
                    }
                    
                    // CITY ANALYSIS - exact same filtering logic
                    if (location && 
                        location.length > 0 && 
                        location !== '#N/A' && 
                        location !== 'NA' &&
                        !location.toLowerCase().includes('location') &&
                        !location.toLowerCase().includes('site') &&
                        !location.toLowerCase().includes('vehicle number')) {
                        
                        if (!cityAnalysis[location]) {
                            cityAnalysis[location] = [];
                        }
                        
                        // Check if this vehicle already exists for this city (avoid duplicates)
                        const existingVehicle = cityAnalysis[location].find(function(v) {
                            return v.vehicle === vehicleNumber;
                        });
                        
                        if (!existingVehicle) {
                            cityAnalysis[location].push({
                                vehicle: vehicleNumber,
                                workingStatus: workingStatus,
                                alignmentStatus: alignmentStatus || 'Unknown',
                                client: clientName || 'Unknown',
                                remarks: remarks || '',
                                date: formattedDate
                            });
                        }
                    }
                }
            }
        });
        
        console.log('📊 Processing completed:');
        console.log(`👥 Clients found: ${Object.keys(clientAnalysis).length}`);
        console.log(`🏙️ Cities found: ${Object.keys(cityAnalysis).length}`);
        console.log(`🚗 Total vehicles: ${allVehicles.length}`);
        console.log('📅 Monthly breakdown:');
        Object.keys(monthlyData).forEach(month => {
            const vehicles = Array.from(monthlyData[month]);
            console.log(`  ${month}: ${vehicles.length} unique vehicles`);
        });
        
        // Generate .gs script data structures
        const gsScriptData = {
            // Monthly breakdown data (exact same as .gs script)
            monthlyAnalysis: this.generateMonthlyAnalysisData(activeVehicles, offlineVehicles, alignmentTimelines, monthlyData, createAlignmentTimeline),
            
            // Client analysis (exact same format as .gs script)
            clientAnalysisTable: this.generateClientAnalysisTable(clientAnalysis, latestDate),
            
            // City analysis (exact same format as .gs script)  
            cityAnalysisTable: this.generateCityAnalysisTable(cityAnalysis, latestDate),
            
            // Comprehensive summary (exact same as .gs script)
            comprehensiveSummary: this.generateComprehensiveSummary(activeVehicles, offlineVehicles, alignmentTimelines, monthlyData, clientAnalysis, cityAnalysis, latestDate)
        };
        
        // Calculate statistics
        const stats = {
            totalVehicles: allVehicles.length,
            activeVehicles: allVehicles.filter(v => v.workingStatus === 'Active').length,
            offlineVehicles: allVehicles.filter(v => v.workingStatus.includes('Offlline') || v.workingStatus.includes('Offline')).length,
            alignedVehicles: allVehicles.filter(v => v.alignmentStatus === 'Alligned').length,
            misalignedVehicles: allVehicles.filter(v => v.alignmentStatus === 'Misalligned').length,
            totalClients: Object.keys(clientAnalysis).length,
            totalLocations: Object.keys(cityAnalysis).length
        };
        
        stats.healthScore = Math.round(((stats.activeVehicles + stats.alignedVehicles) / (stats.totalVehicles * 2)) * 100) || 0;
        
        return {
            stats,
            allVehicles,
            monthlyData,
            clientAnalysis,
            cityAnalysis,
            latestDate,
            gsScriptData,
            lastUpdated: new Date().toLocaleString()
        };
    }
    
    // =================== .GS SCRIPT DATA GENERATORS - EXACT SAME LOGIC ===================
    
    generateMonthlyAnalysisData(activeVehicles, offlineVehicles, alignmentTimelines, monthlyData, createAlignmentTimeline) {
        const monthlyAnalysis = {};
        const months = Object.keys(monthlyData).sort();
        
        months.forEach(month => {
            // 🟢 ACTIVE VEHICLES (exact same logic as .gs script)
            const monthActiveVehicles = [];
            Object.keys(activeVehicles[month] || {}).forEach(function(vehicle) {
                if (activeVehicles[month][vehicle].allActive && activeVehicles[month][vehicle].statuses.length > 0) {
                    monthActiveVehicles.push({
                        vehicle: vehicle,
                        status: `Active in ALL ${month} tabs`
                    });
                }
            });
            monthActiveVehicles.sort((a, b) => a.vehicle.localeCompare(b.vehicle));
            
            // 🔴 OFFLINE VEHICLES (exact same logic as .gs script)
            const monthOfflineVehicles = [];
            Object.keys(offlineVehicles[month] || {}).forEach(function(vehicle) {
                const vehicleData = offlineVehicles[month][vehicle];
                if (vehicleData.dates.length > 0) {
                    // Remove duplicates and sort
                    const uniqueDates = [];
                    vehicleData.dates.forEach(function(date) {
                        if (uniqueDates.indexOf(date) === -1) {
                            uniqueDates.push(date);
                        }
                    });
                    
                    uniqueDates.sort(function(a, b) {
                        const getDateSortKey = (dateStr) => {
                            try {
                                const parts = dateStr.split(' ');
                                if (parts.length >= 2) {
                                    const day = parseInt(parts[0]) || 0;
                                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                                       'July', 'August', 'September', 'October', 'November', 'December'];
                                    const monthIndex = monthNames.indexOf(parts[1]) + 1 || 0;
                                    return monthIndex.toString().padStart(2, '0') + '-' + day.toString().padStart(2, '0');
                                }
                                return dateStr;
                            } catch (error) {
                                return dateStr;
                            }
                        };
                        return getDateSortKey(a).localeCompare(getDateSortKey(b));
                    });
                    
                    monthOfflineVehicles.push({
                        vehicle: vehicle,
                        dates: uniqueDates,
                        remarks: vehicleData.latestRemarks
                    });
                }
            });
            monthOfflineVehicles.sort((a, b) => a.vehicle.localeCompare(b.vehicle));
            
            // ⚖️ ALIGNMENT TIMELINE (exact same logic as .gs script)
            const monthAlignmentVehicles = [];
            Object.keys(alignmentTimelines[month] || {}).forEach(function(vehicle) {
                const vehicleData = alignmentTimelines[month][vehicle];
                if (vehicleData.length > 0) {
                    const timeline = createAlignmentTimeline(vehicleData);
                    const latestEntry = vehicleData[vehicleData.length - 1];
                    
                    monthAlignmentVehicles.push({
                        vehicle: vehicle,
                        timeline: timeline,
                        latestStatus: latestEntry.alignmentStatus,
                        remarks: latestEntry.remarks
                    });
                }
            });
            monthAlignmentVehicles.sort((a, b) => a.vehicle.localeCompare(b.vehicle));
            
            monthlyAnalysis[month] = {
                activeVehicles: monthActiveVehicles,
                offlineVehicles: monthOfflineVehicles,
                alignmentVehicles: monthAlignmentVehicles
            };
        });
        
        return monthlyAnalysis;
    }
    
    generateClientAnalysisTable(clientAnalysis, latestDate) {
        const clientKeys = Object.keys(clientAnalysis).sort();
        const clientTable = [];
        
        let displayDate = latestDate === 'Current' ? 'Recent Data' : latestDate;
        
        clientKeys.forEach((clientName, index) => {
            const vehicles = clientAnalysis[clientName];
            
            // Separate problem vehicles (exact same logic as .gs script)
            const problemVehicles = [];
            
            vehicles.forEach(function(v) {
                if (v.workingStatus === 'Offlline >24Hrs' || v.alignmentStatus === 'Misalligned') {
                    problemVehicles.push(v.vehicle + ' (' + v.workingStatus + '/' + v.alignmentStatus + ')');
                }
            });
            
            const allVehicleNumbers = vehicles.map(function(v) { return v.vehicle; }).join(', ');
            const problemVehicleText = problemVehicles.join(', ') || 'None';
            const statusText = problemVehicles.length > 0 ? 
                'ISSUES: ' + problemVehicles.length + '/' + vehicles.length : 
                'ALL OK';
            
            clientTable.push({
                sno: index + 1,
                clientName: clientName,
                vehicleCount: vehicles.length,
                vehicleNumbers: allVehicleNumbers,
                problemVehicles: problemVehicleText,
                status: statusText,
                hasProblems: problemVehicles.length > 0,
                vehicles: vehicles
            });
        });
        
        return {
            displayDate: displayDate,
            data: clientTable
        };
    }
    
    generateCityAnalysisTable(cityAnalysis, latestDate) {
        const cityKeys = Object.keys(cityAnalysis).sort();
        const cityTable = [];
        
        let displayDate = latestDate === 'Current' ? 'Recent Data' : latestDate;
        
        cityKeys.forEach((cityName, index) => {
            const vehicles = cityAnalysis[cityName];
            
            // Separate problem vehicles (exact same logic as .gs script)
            const problemVehicles = [];
            
            vehicles.forEach(function(v) {
                if (v.workingStatus === 'Offlline >24Hrs' || v.alignmentStatus === 'Misalligned') {
                    problemVehicles.push(v.vehicle + ' (' + v.workingStatus + '/' + v.alignmentStatus + ')');
                }
            });
            
            const allVehicleNumbers = vehicles.map(function(v) { return v.vehicle; }).join(', ');
            const problemVehicleText = problemVehicles.join(', ') || 'None';
            const statusText = problemVehicles.length > 0 ? 
                'ISSUES: ' + problemVehicles.length + '/' + vehicles.length : 
                'ALL OK';
            
            cityTable.push({
                sno: index + 1,
                cityName: cityName,
                vehicleCount: vehicles.length,
                vehicleNumbers: allVehicleNumbers,
                problemVehicles: problemVehicleText,
                status: statusText,
                hasProblems: problemVehicles.length > 0,
                vehicles: vehicles
            });
        });
        
        return {
            displayDate: displayDate,
            data: cityTable
        };
    }
    
    generateComprehensiveSummary(activeVehicles, offlineVehicles, alignmentTimelines, monthlyData, clientAnalysis, cityAnalysis, latestDate) {
        const months = Object.keys(monthlyData).sort();
        const monthlyCounts = {};
        
        // Calculate monthly counts (exact same logic as .gs script)
        months.forEach(month => {
            const activeCount = Object.keys(activeVehicles[month] || {}).filter(function(vehicle) {
                return activeVehicles[month][vehicle].allActive && activeVehicles[month][vehicle].statuses.length > 0;
            }).length;
            
            const offlineCount = Object.keys(offlineVehicles[month] || {}).filter(function(vehicle) {
                return offlineVehicles[month][vehicle].dates.length > 0;
            }).length;
            
            const alignmentCount = Object.keys(alignmentTimelines[month] || {}).filter(function(vehicle) {
                return alignmentTimelines[month][vehicle].length > 0;
            }).length;
            
            monthlyCounts[month] = {
                active: activeCount,
                offline: offlineCount,
                alignment: alignmentCount
            };
        });
        
        // Calculate total unique vehicles (exact same logic as .gs script)
        const allVehicles = new Set();
        Object.keys(monthlyData).forEach(function(month) {
            monthlyData[month].forEach(function(vehicle) {
                allVehicles.add(vehicle);
            });
        });
        
        let displayDate = latestDate === 'Current' ? 'Recent Data' : latestDate;
        
        return {
            monthlyCounts: monthlyCounts,
            totalVehicles: allVehicles.size,
            totalClients: Object.keys(clientAnalysis).length,
            totalCities: Object.keys(cityAnalysis).length,
            dataSourceDate: displayDate
        };
    }
    
    // =================== UI MANAGEMENT ===================
    
    startLoading() {
        this.showLoadingOverlay();
        this.fetchAndRenderData();
    }
    
    showLoadingOverlay() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }
    
    hideLoadingOverlay() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }
    
    updateLoadingStatus(status) {
        const element = document.getElementById('loadingStatus');
        if (element) {
            element.textContent = status;
        }
    }
    
    updateSpeed(status) {
        const indicator = document.getElementById('speedIndicator');
        const elapsed = (Date.now() - this.loadStartTime) / 1000;
        indicator.innerHTML = `⚡ ${status} (${elapsed.toFixed(1)}s)`;
        
        if (status.includes('Complete')) {
            indicator.style.background = 'var(--success)';
            indicator.style.animation = 'none';
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 2000);
        }
    }
    
    showError(message) {
        const errorHtml = `
            <div class="error-container">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error</h3>
                <p>${message}</p>
                <button onclick="dashboard.showConfigModal()" style="margin-top: 15px; padding: 10px 20px; background: white; color: #ef4444; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                    Update Configuration
                </button>
            </div>
        `;
        
        document.getElementById('statsGrid').innerHTML = errorHtml;
        this.hideLoadingOverlay();
    }
    
    // =================== DATA FETCHING & RENDERING ===================
    
    async fetchAndRenderData() {
        try {
            this.loadStartTime = Date.now();
            this.updateSpeed('Loading...');
            
            const data = await this.fetchSheetData();
            this.cache.mainData = data;
            
            this.hideLoadingOverlay();
            this.renderDashboard(data);
            this.updateSpeed('Complete');
            
        } catch (error) {
            console.error('❌ Failed to load data:', error);
            this.hideLoadingOverlay();
            this.showError(error.message);
            this.updateSpeed('Error');
        }
    }
    
    renderDashboard(data) {
        this.renderStats(data);
        this.renderClientList(data);
        this.renderLocationList(data);
        this.renderCharts(data);
        this.updateLastUpdated(data.lastUpdated);
    }
    
    // =================== FAST RENDERING FUNCTIONS ===================
    
    renderStats(data) {
        const stats = data.stats || {};
        document.getElementById('statsGrid').innerHTML = `
            <div class="stat-card total" onclick="dashboard.showVehicleDetails('total')">
                <div class="stat-icon"><i class="fas fa-cars"></i></div>
                <div class="stat-value">${stats.totalVehicles || 0}</div>
                <div class="stat-label">Total Vehicles</div>
            </div>
            <div class="stat-card active" onclick="dashboard.showVehicleDetails('active')">
                <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="stat-value">${stats.activeVehicles || 0}</div>
                <div class="stat-label">Active Vehicles</div>
            </div>
            <div class="stat-card aligned" onclick="dashboard.showVehicleDetails('aligned')">
                <div class="stat-icon"><i class="fas fa-align-center"></i></div>
                <div class="stat-value">${stats.alignedVehicles || 0}</div>
                <div class="stat-label">Aligned Vehicles</div>
            </div>
            <div class="stat-card misaligned" onclick="dashboard.showVehicleDetails('misaligned')">
                <div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="stat-value">${stats.misalignedVehicles || 0}</div>
                <div class="stat-label">Misaligned Vehicles</div>
            </div>
            <div class="stat-card offline" onclick="dashboard.showVehicleDetails('offline')">
                <div class="stat-icon"><i class="fas fa-wifi-slash"></i></div>
                <div class="stat-value">${stats.offlineVehicles || 0}</div>
                <div class="stat-label">Offline 24+ hrs</div>
            </div>
            <div class="stat-card health">
                <div class="stat-icon"><i class="fas fa-heart-pulse"></i></div>
                <div class="stat-value">${stats.healthScore || 0}%</div>
                <div class="stat-label">Health Score</div>
            </div>
        `;
    }
    
    renderClientList(data, showIssuesOnly = false) {
        const clientAnalysis = data.clientAnalysis || {};
        const clients = Object.keys(clientAnalysis).sort().slice(0, 15);
        
        let filteredClients = clients;
        if (showIssuesOnly) {
            filteredClients = clients.filter(clientName => {
                const vehicles = clientAnalysis[clientName];
                return vehicles.some(v => v.workingStatus === 'Offlline >24Hrs' || v.alignmentStatus === 'Misalligned');
            });
        }
        
        const html = filteredClients.map(clientName => {
            const vehicles = clientAnalysis[clientName];
            const problemCount = vehicles.filter(v => 
                v.workingStatus === 'Offlline >24Hrs' || v.alignmentStatus === 'Misalligned'
            ).length;
            
            const hasProblems = problemCount > 0;
            const problemText = hasProblems ? ` (${problemCount} issues)` : '';
            const classString = hasProblems ? 'list-item has-issues' : 'list-item';
            
            return `
                <div class="${classString}" onclick="dashboard.showClientDetails('${clientName}')">
                    <span class="item-name">
                        <i class="fas ${hasProblems ? 'fa-exclamation-triangle' : 'fa-building'}"></i> 
                        ${clientName}${problemText}
                    </span>
                    <span class="item-count">${vehicles.length}</span>
                </div>
            `;
        }).join('');
        
        document.getElementById('clientList').innerHTML = html;
    }
    
    renderLocationList(data, showIssuesOnly = false) {
        const locationAnalysis = data.cityAnalysis || {};
        const locations = Object.keys(locationAnalysis).sort().slice(0, 15);
        
        let filteredLocations = locations;
        if (showIssuesOnly) {
            filteredLocations = locations.filter(locationName => {
                const vehicles = locationAnalysis[locationName];
                return vehicles.some(v => v.workingStatus === 'Offlline >24Hrs' || v.alignmentStatus === 'Misalligned');
            });
        }
        
        const html = filteredLocations.map(locationName => {
            const vehicles = locationAnalysis[locationName];
            const problemCount = vehicles.filter(v => 
                v.workingStatus === 'Offlline >24Hrs' || v.alignmentStatus === 'Misalligned'
            ).length;
            
            const hasProblems = problemCount > 0;
            const problemText = hasProblems ? ` (${problemCount} issues)` : '';
            const classString = hasProblems ? 'list-item has-issues' : 'list-item';
            
            return `
                <div class="${classString}" onclick="dashboard.showLocationDetails('${locationName}')">
                    <span class="item-name">
                        <i class="fas ${hasProblems ? 'fa-exclamation-triangle' : 'fa-map-marker-alt'}"></i> 
                        ${locationName}${problemText}
                    </span>
                    <span class="item-count">${vehicles.length}</span>
                </div>
            `;
        }).join('');
        
        document.getElementById('locationList').innerHTML = html;
    }
    
    renderCharts(data) {
        this.renderIssuesChart(data);
        this.renderStatusChart(data);
    }
    
    renderIssuesChart(data) {
        const ctx = document.getElementById('heatmapChart');
        if (!ctx) return;

        if (this.charts.heatmap) this.charts.heatmap.destroy();

        // Generate current month issues data
        const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
        const currentMonthVehicles = data.allVehicles.filter(v => v.month === currentMonth);
        
        // Group by date and count issues
        const dailyIssues = {};
        currentMonthVehicles.forEach(vehicle => {
            const date = vehicle.date;
            if (!dailyIssues[date]) {
                dailyIssues[date] = 0;
            }
            
            // Count misalignment and offline issues
            if (vehicle.alignmentStatus === 'Misalligned') {
                dailyIssues[date]++;
            }
            if (vehicle.workingStatus === 'Offlline >24Hrs') {
                dailyIssues[date]++;
            }
        });
        
        const labels = Object.keys(dailyIssues).sort().slice(-7); // Last 7 days
        const issueData = labels.map(date => dailyIssues[date] || 0);
        
        this.charts.heatmap = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Issues',
                    data: issueData,
                    backgroundColor: issueData.map(value => {
                        if (value > 5) return '#ef4444';
                        if (value > 2) return '#f59e0b';
                        return '#10b981';
                    }),
                    borderWidth: 0,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: '#667eea',
                        borderWidth: 1,
                        callbacks: {
                            title: function(context) {
                                return `Date: ${context[0].label}`;
                            },
                            label: function(context) {
                                return `Issues: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: { 
                    y: { 
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { 
                            color: '#94a3b8',
                            stepSize: 1
                        },
                        title: {
                            display: true,
                            text: 'Number of Issues',
                            color: '#94a3b8',
                            font: { size: 12 }
                        }
                    },
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { 
                            color: '#94a3b8',
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: 'Dates',
                            color: '#94a3b8',
                            font: { size: 12 }
                        }
                    }
                },
                animation: { duration: 800, easing: 'easeOutQuart' },
                onHover: (event, activeElements) => {
                    event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
                }
            }
        });
    }
    
    renderStatusChart(data) {
        const ctx = document.getElementById('clientStatusChart');
        if (!ctx) return;

        if (this.charts.clientStatus) this.charts.clientStatus.destroy();

        // Calculate client status distribution
        const clientAnalysis = data.clientAnalysis || {};
        let allOK = 0;
        let hasIssues = 0;
        
        Object.keys(clientAnalysis).forEach(clientName => {
            const vehicles = clientAnalysis[clientName];
            const problemCount = vehicles.filter(v => 
                v.workingStatus === 'Offlline >24Hrs' || v.alignmentStatus === 'Misalligned'
            ).length;
            
            if (problemCount > 0) {
                hasIssues++;
            } else {
                allOK++;
            }
        });

        const statusData = { 'All OK': allOK, 'Has Issues': hasIssues };
        const labels = Object.keys(statusData);
        const chartData = Object.values(statusData);

        this.charts.clientStatus = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: chartData,
                    backgroundColor: ['#10b981', '#ef4444'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            font: { size: 12, weight: 'bold' },
                            color: '#e2e8f0',
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: '#667eea',
                        borderWidth: 1
                    }
                },
                animation: { duration: 1000, easing: 'easeOutQuart' }
            }
        });
    }
    
    updateLastUpdated(lastUpdated) {
        const element = document.getElementById('lastUpdated');
        if (element) {
            element.innerHTML = `<i class="fas fa-clock"></i> ${lastUpdated}`;
        }
    }
    
    // =================== TAB SWITCHING & LOADING ===================
    
    switchTab(tabIndex) {
        // Instant UI switch
        document.querySelectorAll('.tab').forEach((tab, index) => {
            tab.classList.toggle('active', index === tabIndex);
        });
        document.querySelectorAll('.tab-content').forEach((content, index) => {
            content.classList.toggle('active', index === tabIndex);
        });

        // Load tab data ONLY when needed
        if (tabIndex > 0) {
            this.loadTabData(tabIndex);
        }
    }

    loadTabData(tabIndex) {
        const tabKey = `tab_${tabIndex}`;
        
        // Check cache first - INSTANT if cached
        if (this.cache[tabKey]) {
            this.renderTab(tabIndex, this.cache[tabKey]);
            return;
        }

        // Show loading
        const tabContent = document.querySelector(`#tab${tabIndex}`);
        if (tabContent) {
            tabContent.classList.add('loading');
        }

        // Load data for specific tab
        switch (tabIndex) {
            case 1:
                this.cache[tabKey] = this.cache.mainData?.gsScriptData?.monthlyAnalysis || {};
                this.renderMonthlyAnalysis(this.cache[tabKey]);
                tabContent?.classList.remove('loading');
                break;
            case 2:
                this.cache[tabKey] = this.cache.mainData?.gsScriptData?.clientAnalysisTable || {};
                this.renderGSClientAnalysis(this.cache[tabKey]);
                tabContent?.classList.remove('loading');
                break;
            case 3:
                this.cache[tabKey] = this.cache.mainData?.gsScriptData?.cityAnalysisTable || {};
                this.renderGSCityAnalysis(this.cache[tabKey]);
                tabContent?.classList.remove('loading');
                break;
            case 4:
                this.cache[tabKey] = this.cache.mainData?.gsScriptData?.comprehensiveSummary || {};
                this.renderComprehensiveSummary(this.cache[tabKey]);
                tabContent?.classList.remove('loading');
                break;
            case 5:
                this.cache[tabKey] = this.cache.mainData || {};
                this.renderClientAnalysis(this.cache[tabKey]);
                tabContent?.classList.remove('loading');
                break;
            case 6:
                this.cache[tabKey] = this.cache.mainData || {};
                this.renderLocationAnalysis(this.cache[tabKey]);
                tabContent?.classList.remove('loading');
                break;
        }
    }
    
    // =================== ENHANCED TAB RENDERING FUNCTIONS ===================
    
    renderMonthlyAnalysis(monthlyData) {
        if (!monthlyData) return;

        const months = Object.keys(monthlyData).sort();
        const monthFilter = document.getElementById('monthFilter');
        
        monthFilter.innerHTML = '<option value="all">All Months</option>' + 
            months.map(m => `<option value="${m}">${m}</option>`).join('');

        let html = '';
        months.forEach(month => {
            const data = monthlyData[month];
            
            html += `
                <div style="margin-bottom: 40px;">
                    <h4 style="background: var(--status-active-bg); color: white; padding: 20px; margin: 0; border-radius: 15px; text-align: center; font-size: 1.2rem; font-weight: 800;">
                        🟢 ACTIVE VEHICLES - ${month.toUpperCase()}
                    </h4>
                    <div style="margin-top: 20px;">
                        ${data.activeVehicles.length === 0 ? 
                            `<p style="font-style: italic; color: var(--text-secondary); text-align: center; padding: 30px; background: var(--bg-card); border-radius: 12px;">No active vehicles found for ${month}</p>` :
                            this.generateActiveTable(data.activeVehicles)
                        }
                    </div>
                    
                    <h4 style="background: var(--status-offline-bg); color: white; padding: 20px; margin: 30px 0 0 0; border-radius: 15px; text-align: center; font-size: 1.2rem; font-weight: 800;">
                        🔴 OFFLINE >24HRS VEHICLES - ${month.toUpperCase()}
                    </h4>
                    <div style="margin-top: 20px;">
                        ${data.offlineVehicles.length === 0 ?
                            `<p style="font-style: italic; color: var(--text-secondary); text-align: center; padding: 30px; background: var(--bg-card); border-radius: 12px;">No offline vehicles found for ${month}</p>` :
                            this.generateOfflineTable(data.offlineVehicles)
                        }
                    </div>
                    
                    <h4 style="background: var(--status-aligned-bg); color: white; padding: 20px; margin: 30px 0 0 0; border-radius: 15px; text-align: center; font-size: 1.2rem; font-weight: 800;">
                        ⚖️ ALIGNMENT TIMELINE - ${month.toUpperCase()}
                    </h4>
                    <div style="margin-top: 20px;">
                        ${data.alignmentVehicles.length === 0 ?
                            `<p style="font-style: italic; color: var(--text-secondary); text-align: center; padding: 30px; background: var(--bg-card); border-radius: 12px;">No alignment changes found for ${month}</p>` :
                            this.generateAlignmentTable(data.alignmentVehicles)
                        }
                    </div>
                </div>
            `;
        });

        document.getElementById('monthlyAnalysisContainer').innerHTML = html;
    }

    generateActiveTable(vehicles) {
        const rows = vehicles.map((vehicle, index) => `
            <tr>
                <td style="text-align: center; color: var(--text-primary); font-weight: 600;">${index + 1}</td>
                <td style="text-align: center; font-weight: 700; color: var(--text-primary);">${vehicle.vehicle}</td>
                <td style="text-align: center;"><span class="status-active">${vehicle.status}</span></td>
            </tr>
        `).join('');
        
        return `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: var(--bg-card); border-radius: 15px; overflow: hidden; box-shadow: var(--shadow);">
                <thead>
                    <tr style="background: var(--status-active-bg);">
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">S.No</th>
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">Vehicle Number</th>
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">Status</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    generateOfflineTable(vehicles) {
        const maxDates = Math.max(...vehicles.map(v => v.dates.length));
        
        const headerCols = Array.from({length: maxDates}, (_, i) => 
            `<th style="padding: 15px; color: white; text-align: center; font-weight: 800;">Date ${i + 1}</th>`
        ).join('');
        
        const rows = vehicles.map((vehicle, index) => {
            const dateCols = Array.from({length: maxDates}, (_, i) => {
                const dateValue = vehicle.dates[i] || '';
                return `<td style="padding: 12px; text-align: center; color: var(--text-primary);">${dateValue}</td>`;
            }).join('');
            
            return `
                <tr>
                    <td style="padding: 12px; text-align: center; color: var(--text-primary); font-weight: 600;">${index + 1}</td>
                    <td style="padding: 12px; text-align: center; font-weight: 700; color: var(--text-primary);">${vehicle.vehicle}</td>
                    ${dateCols}
                    <td style="padding: 12px; text-align: center; color: var(--text-primary);">${vehicle.remarks}</td>
                </tr>
            `;
        }).join('');
        
        return `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: var(--bg-card); border-radius: 15px; overflow: hidden; box-shadow: var(--shadow);">
                <thead>
                    <tr style="background: var(--status-offline-bg);">
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">S.No</th>
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">Vehicle Number</th>
                        ${headerCols}
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">Remarks</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    generateAlignmentTable(vehicles) {
        const rows = vehicles.map((vehicle, index) => {
            const statusClass = vehicle.latestStatus === 'Alligned' ? 'status-aligned' : 'status-misaligned';
            return `
                <tr>
                    <td style="padding: 12px; text-align: center; color: var(--text-primary); font-weight: 600;">${index + 1}</td>
                    <td style="padding: 12px; text-align: center; font-weight: 700; color: var(--text-primary);">${vehicle.vehicle}</td>
                    <td style="padding: 12px; max-width: 300px; color: var(--text-primary); font-size: 0.9rem;">${vehicle.timeline}</td>
                    <td style="padding: 12px; text-align: center;"><span class="${statusClass}">${vehicle.latestStatus}</span></td>
                    <td style="padding: 12px; text-align: center; color: var(--text-primary);">${vehicle.remarks}</td>
                </tr>
            `;
        }).join('');
        
        return `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: var(--bg-card); border-radius: 15px; overflow: hidden; box-shadow: var(--shadow);">
                <thead>
                    <tr style="background: var(--status-aligned-bg);">
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">S.No</th>
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">Vehicle Number</th>
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">Alignment Timeline</th>
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">Latest Status</th>
                        <th style="padding: 15px; color: white; text-align: center; font-weight: 800;">Remarks</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    renderGSClientAnalysis(clientData) {
        if (!clientData || !clientData.data) return;

        const html = clientData.data.map(client => {
            const statusClass = client.hasProblems ? 'status-offline' : 'status-active';
            const rowClass = client.hasProblems ? 'style="background: rgba(239, 68, 68, 0.1);"' : '';
            
            return `
                <tr ${rowClass}>
                    <td style="text-align: center; font-weight: 700; color: var(--text-primary);">${client.sno}</td>
                    <td><strong style="color: var(--text-primary); font-size: 1rem;">${client.clientName}</strong></td>
                    <td style="text-align: center; font-weight: 700; color: var(--text-primary);">${client.vehicleCount}</td>
                    <td style="max-width: 250px; font-size: 0.85rem; color: var(--text-primary);">${client.vehicleNumbers}</td>
                    <td style="max-width: 250px; font-size: 0.85rem; color: var(--text-primary);">${client.problemVehicles}</td>
                    <td style="text-align: center;"><span class="${statusClass}">${client.status}</span></td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('gsClientAnalysisBody').innerHTML = html;
        
        const status = document.getElementById('gsClientFilterStatus');
        if (status) {
            status.innerHTML = `<i class="fas fa-building"></i> Client Analysis from ${clientData.displayDate} - ${clientData.data.length} clients found`;
            status.style.background = 'var(--success)';
            status.style.color = 'white';
        }
    }

    renderGSCityAnalysis(cityData) {
        if (!cityData || !cityData.data) return;

        const html = cityData.data.map(city => {
            const statusClass = city.hasProblems ? 'status-offline' : 'status-active';
            const rowClass = city.hasProblems ? 'style="background: rgba(239, 68, 68, 0.1);"' : '';
            
            return `
                <tr ${rowClass}>
                    <td style="text-align: center; font-weight: 700; color: var(--text-primary);">${city.sno}</td>
                    <td><strong style="color: var(--text-primary); font-size: 1rem;">${city.cityName}</strong></td>
                    <td style="text-align: center; font-weight: 700; color: var(--text-primary);">${city.vehicleCount}</td>
                    <td style="max-width: 250px; font-size: 0.85rem; color: var(--text-primary);">${city.vehicleNumbers}</td>
                    <td style="max-width: 250px; font-size: 0.85rem; color: var(--text-primary);">${city.problemVehicles}</td>
                    <td style="text-align: center;"><span class="${statusClass}">${city.status}</span></td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('gsCityAnalysisBody').innerHTML = html;
        
        const status = document.getElementById('gsCityFilterStatus');
        if (status) {
            status.innerHTML = `<i class="fas fa-map-marker-alt"></i> City Analysis from ${cityData.displayDate} - ${cityData.data.length} cities found`;
            status.style.background = 'var(--success)';
            status.style.color = 'white';
        }
    }

    renderComprehensiveSummary(summaryData) {
        if (!summaryData) return;

        const months = Object.keys(summaryData.monthlyCounts).sort();
        
        const monthlyCardsHtml = months.map(month => {
            const counts = summaryData.monthlyCounts[month];
            return `
                <div style="margin-bottom: 25px; padding: 25px; background: var(--bg-glass); border-radius: 18px; border: 1px solid var(--border); box-shadow: var(--shadow);">
                    <h4 style="margin: 0 0 20px 0; color: white; font-size: 1.2rem; text-align: center; background: var(--primary); padding: 15px; border-radius: 12px; font-weight: 800;">${month.toUpperCase()} SUMMARY</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px;">
                        <div style="background: var(--status-active-bg); color: white; padding: 20px; border-radius: 12px; text-align: center; box-shadow: var(--shadow);">
                            <div style="font-size: 2rem; font-weight: 900; margin-bottom: 6px;">${counts.active}</div>
                            <div style="font-size: 0.9rem; font-weight: 700;">🟢 Active Vehicles</div>
                        </div>
                        <div style="background: var(--status-offline-bg); color: white; padding: 20px; border-radius: 12px; text-align: center; box-shadow: var(--shadow);">
                            <div style="font-size: 2rem; font-weight: 900; margin-bottom: 6px;">${counts.offline}</div>
                            <div style="font-size: 0.9rem; font-weight: 700;">🔴 Offline Vehicles</div>
                        </div>
                        <div style="background: var(--status-aligned-bg); color: white; padding: 20px; border-radius: 12px; text-align: center; box-shadow: var(--shadow);">
                            <div style="font-size: 2rem; font-weight: 900; margin-bottom: 6px;">${counts.alignment}</div>
                            <div style="font-size: 0.9rem; font-weight: 700;">⚖️ Alignment Issues</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const html = `
            <div style="background: var(--primary); color: white; padding: 30px; border-radius: 18px; text-align: center; margin-bottom: 35px; box-shadow: var(--shadow);">
                <h3 style="margin: 0; font-size: 2rem; font-weight: 900;">📊 COMPREHENSIVE ANALYSIS SUMMARY</h3>
                <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 1.1rem; font-weight: 500;">Complete vehicle performance overview</p>
            </div>
            
            <div style="margin-bottom: 35px;">
                <h4 style="color: var(--text-primary); margin-bottom: 25px; text-align: center; font-size: 1.4rem; font-weight: 800;">📅 MONTHLY BREAKDOWN</h4>
                ${monthlyCardsHtml}
            </div>
            
            <div style="background: var(--bg-glass); padding: 35px; border-radius: 20px; border: 1px solid var(--border); box-shadow: var(--shadow);">
                <h3 style="color: white; margin-bottom: 30px; text-align: center; font-size: 1.6rem; background: var(--primary); padding: 15px; border-radius: 12px; font-weight: 900;">📈 OVERALL TOTALS</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 25px;">
                    <div style="text-align: center; padding: 30px; background: var(--primary); color: white; border-radius: 15px; box-shadow: var(--shadow);">
                        <div style="font-size: 3rem; font-weight: 900; margin-bottom: 10px;">${summaryData.totalVehicles}</div>
                        <div style="font-size: 1.1rem; font-weight: 700;">🚗 Total Vehicles</div>
                    </div>
                    <div style="text-align: center; padding: 30px; background: var(--secondary); color: white; border-radius: 15px; box-shadow: var(--shadow);">
                        <div style="font-size: 3rem; font-weight: 900; margin-bottom: 10px;">${summaryData.totalClients}</div>
                        <div style="font-size: 1.1rem; font-weight: 700;">👥 Total Clients</div>
                    </div>
                    <div style="text-align: center; padding: 30px; background: var(--success); color: white; border-radius: 15px; box-shadow: var(--shadow);">
                        <div style="font-size: 3rem; font-weight: 900; margin-bottom: 10px;">${summaryData.totalCities}</div>
                        <div style="font-size: 1.1rem; font-weight: 700;">🏙️ Total Cities</div>
                    </div>
                    <div style="text-align: center; padding: 30px; background: var(--warning); color: white; border-radius: 15px; box-shadow: var(--shadow);">
                        <div style="font-size: 1.4rem; font-weight: 900; margin-bottom: 10px;">${summaryData.dataSourceDate}</div>
                        <div style="font-size: 1.1rem; font-weight: 700;">📅 Data Source Date</div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('comprehensiveSummaryContainer').innerHTML = html;
    }

    renderClientAnalysis(data) {
        if (!data || !data.clientAnalysis) return;

        // Convert clientAnalysis to array format
        const clientsArray = Object.keys(data.clientAnalysis).map(clientName => {
            const vehicles = data.clientAnalysis[clientName];
            return {
                name: clientName,
                totalVehicles: vehicles.length,
                activeVehicles: vehicles.filter(v => v.workingStatus === 'Active').length,
                offlineVehicles: vehicles.filter(v => v.workingStatus.includes('Offlline') || v.workingStatus.includes('Offline')).length,
                alignedVehicles: vehicles.filter(v => v.alignmentStatus === 'Alligned').length,
                misalignedVehicles: vehicles.filter(v => v.alignmentStatus === 'Misalligned').length,
                vehicles: vehicles
            };
        }).sort((a, b) => b.totalVehicles - a.totalVehicles);

        // Render table
        const html = clientsArray.map(client => `
            <tr onclick="dashboard.showClientDetails('${client.name}')" style="cursor: pointer;" onmouseover="this.style.background='var(--bg-glass)'" onmouseout="this.style.background=''">
                <td><strong style="color: var(--text-primary); font-size: 1rem;">${client.name}</strong></td>
                <td style="color: var(--text-primary); font-weight: 600;">${client.totalVehicles}</td>
                <td><span class="status-active">${client.activeVehicles}</span></td>
                <td><span class="status-offline">${client.offlineVehicles}</span></td>
                <td><span class="status-aligned">${client.alignedVehicles}</span></td>
                <td><span class="status-misaligned">${client.misalignedVehicles}</span></td>
                <td style="color: var(--text-primary);">Multiple</td>
            </tr>
        `).join('');

        document.getElementById('clientAnalysisBody').innerHTML = html;

        // Render chart
        const ctx = document.getElementById('clientChart');
        if (ctx) {
            if (this.charts.client) this.charts.client.destroy();

            const labels = clientsArray.slice(0, 12).map(c => c.name);
            const chartData = clientsArray.slice(0, 12).map(c => c.totalVehicles);
            const colors = [
                '#667eea', '#f093fb', '#4facfe', '#fa709a', '#ff6b6b',
                '#764ba2', '#fee140', '#00f2fe', '#f5576c', '#ee5a52',
                '#a8edea', '#fed6e3'
            ];

            this.charts.client = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: chartData,
                        backgroundColor: colors,
                        borderWidth: 0,
                        hoverOffset: 15
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { 
                                font: { size: 11, weight: 'bold' },
                                color: '#e2e8f0',
                                padding: 15
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: 'white',
                            bodyColor: 'white',
                            borderColor: '#667eea',
                            borderWidth: 1
                        }
                    },
                    animation: { duration: 1200, easing: 'easeOutQuart' }
                }
            });
        }
    }

    renderLocationAnalysis(data) {
        if (!data || !data.cityAnalysis) return;

        // Convert cityAnalysis to array format
        const locationsArray = Object.keys(data.cityAnalysis).map(locationName => {
            const vehicles = data.cityAnalysis[locationName];
            return {
                name: locationName,
                totalVehicles: vehicles.length,
                activeVehicles: vehicles.filter(v => v.workingStatus === 'Active').length,
                offlineVehicles: vehicles.filter(v => v.workingStatus.includes('Offlline') || v.workingStatus.includes('Offline')).length,
                alignedVehicles: vehicles.filter(v => v.alignmentStatus === 'Alligned').length,
                misalignedVehicles: vehicles.filter(v => v.alignmentStatus === 'Misalligned').length,
                vehicles: vehicles
            };
        }).sort((a, b) => b.totalVehicles - a.totalVehicles);

        // Render table
        const html = locationsArray.map(location => `
            <tr onclick="dashboard.showLocationDetails('${location.name}')" style="cursor: pointer;" onmouseover="this.style.background='var(--bg-glass)'" onmouseout="this.style.background=''">
                <td><strong style="color: var(--text-primary); font-size: 1rem;">${location.name}</strong></td>
                <td style="color: var(--text-primary); font-weight: 600;">${location.totalVehicles}</td>
                <td><span class="status-active">${location.activeVehicles}</span></td>
                <td><span class="status-offline">${location.offlineVehicles}</span></td>
                <td><span class="status-aligned">${location.alignedVehicles}</span></td>
                <td><span class="status-misaligned">${location.misalignedVehicles}</span></td>
                <td style="color: var(--text-primary);">Multiple</td>
            </tr>
        `).join('');

        document.getElementById('locationAnalysisBody').innerHTML = html;

        // Render chart
        const ctx = document.getElementById('locationChart');
        if (ctx) {
            if (this.charts.location) this.charts.location.destroy();

            const labels = locationsArray.slice(0, 12).map(l => l.name);
            const chartData = locationsArray.slice(0, 12).map(l => l.totalVehicles);

            this.charts.location = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Vehicles',
                        data: chartData,
                        backgroundColor: '#4facfe',
                        borderWidth: 0,
                        borderRadius: 8,
                        hoverBackgroundColor: '#00f2fe'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: 'white',
                            bodyColor: 'white',
                            borderColor: '#667eea',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true,
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            ticks: { color: '#94a3b8' }
                        },
                        x: { 
                            ticks: { 
                                maxRotation: 45, 
                                font: { size: 10 },
                                color: '#94a3b8'
                            },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        }
                    },
                    animation: { duration: 1000, easing: 'easeOutQuart' }
                }
            });
        }
    }
    
    // =================== SEARCH & FILTER FUNCTIONS ===================
    
    performDashboardSearch() {
        const searchTerm = document.getElementById('dashboardSearchInput').value.toLowerCase();
        const searchSection = document.getElementById('searchResultsSection');
        const searchStatus = document.getElementById('dashboardSearchStatus');
        const tbody = document.getElementById('dashboardSearchBody');

        // Clear previous timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        if (!searchTerm.trim()) {
            searchSection.style.display = 'none';
            searchStatus.style.display = 'none';
            return;
        }

        // Debounce for better performance
        this.debounceTimer = setTimeout(() => {
            const allVehicles = this.cache.mainData?.allVehicles || [];
            const results = allVehicles.filter(vehicle => 
                vehicle.vehicle.toLowerCase().includes(searchTerm) ||
                vehicle.client.toLowerCase().includes(searchTerm) ||
                vehicle.location.toLowerCase().includes(searchTerm) ||
                vehicle.workingStatus.toLowerCase().includes(searchTerm) ||
                vehicle.alignmentStatus.toLowerCase().includes(searchTerm) ||
                vehicle.vehicleType.toLowerCase().includes(searchTerm) ||
                vehicle.remarks.toLowerCase().includes(searchTerm)
            );

            if (results && results.length > 0) {
                const html = results.slice(0, 50).map(vehicle => {
                    const workingStatusClass = vehicle.workingStatus.toLowerCase().includes('active') ? 'status-active' : 'status-offline';
                    const alignmentStatusClass = vehicle.alignmentStatus.toLowerCase().includes('alligned') && !vehicle.alignmentStatus.toLowerCase().includes('misalligned') ? 'status-aligned' : 'status-misaligned';
                    
                    return `
                        <tr>
                            <td style="color: var(--text-primary); font-weight: 600;">${vehicle.vehicle}</td>
                            <td style="color: var(--text-primary);">${vehicle.client}</td>
                            <td style="color: var(--text-primary);">${vehicle.location}</td>
                            <td><span class="${workingStatusClass}">${vehicle.workingStatus}</span></td>
                            <td><span class="${alignmentStatusClass}">${vehicle.alignmentStatus}</span></td>
                            <td style="color: var(--text-primary);">${vehicle.date}</td>
                        </tr>
                    `;
                }).join('');

                tbody.innerHTML = html;
                searchStatus.innerHTML = `<i class="fas fa-search"></i> Found ${results.length} results for "${searchTerm}"`;
                searchStatus.style.background = 'var(--success)';
            } else {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-secondary);">No results found for "${searchTerm}"</td></tr>`;
                searchStatus.innerHTML = `<i class="fas fa-search"></i> No results found for "${searchTerm}"`;
                searchStatus.style.background = 'var(--danger)';
            }
            
            searchStatus.style.color = 'white';
            searchStatus.style.display = 'flex';
            searchSection.style.display = 'block';
        }, 300); // 300ms debounce
    }
    
    toggleClientList(filter) {
        document.querySelectorAll('#tab0 .section-card:first-child .list-toggle-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        if (this.cache.mainData) {
            this.renderClientList(this.cache.mainData, filter === 'issues');
        }
    }

    toggleLocationList(filter) {
        document.querySelectorAll('#tab0 .section-card:last-child .list-toggle-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        if (this.cache.mainData) {
            this.renderLocationList(this.cache.mainData, filter === 'issues');
        }
    }

    updateMonthlyAnalysisByMonth() {
        const selectedMonth = document.getElementById('monthFilter').value;
        const monthlyData = this.cache.mainData?.gsScriptData?.monthlyAnalysis || {};
        
        if (selectedMonth === 'all') {
            this.renderMonthlyAnalysis(monthlyData);
        } else {
            const filtered = {};
            if (monthlyData[selectedMonth]) {
                filtered[selectedMonth] = monthlyData[selectedMonth];
            }
            this.renderMonthlyAnalysis(filtered);
        }
    }
    
    // =================== MODAL FUNCTIONS ===================
    
    showVehicleDetails(category) {
        if (!this.cache.mainData) return;
        
        const data = this.cache.mainData;
        let vehicles = [];
        let title = '';
        
        switch (category) {
            case 'total':
                vehicles = data.allVehicles;
                title = `All Vehicles (${vehicles.length})`;
                break;
            case 'active':
                vehicles = data.allVehicles.filter(v => v.workingStatus === 'Active');
                title = `Active Vehicles (${vehicles.length})`;
                break;
            case 'offline':
                vehicles = data.allVehicles.filter(v => v.workingStatus.includes('Offlline') || v.workingStatus.includes('Offline'));
                title = `Offline Vehicles (${vehicles.length})`;
                break;
            case 'aligned':
                vehicles = data.allVehicles.filter(v => v.alignmentStatus === 'Alligned');
                title = `Aligned Vehicles (${vehicles.length})`;
                break;
            case 'misaligned':
                vehicles = data.allVehicles.filter(v => v.alignmentStatus === 'Misalligned');
                title = `Misaligned Vehicles (${vehicles.length})`;
                break;
        }
        
        this.showVehicleModal(title, vehicles);
    }
    
    showClientDetails(clientName) {
        if (!this.cache.mainData || !this.cache.mainData.clientAnalysis[clientName]) return;
        
        const vehicles = this.cache.mainData.clientAnalysis[clientName];
        const title = `Client: ${clientName} (${vehicles.length} vehicles)`;
        
        this.showVehicleModal(title, vehicles);
    }
    
    showLocationDetails(locationName) {
        if (!this.cache.mainData || !this.cache.mainData.cityAnalysis[locationName]) return;
        
        const vehicles = this.cache.mainData.cityAnalysis[locationName];
        const title = `Location: ${locationName} (${vehicles.length} vehicles)`;
        
        this.showVehicleModal(title, vehicles);
    }
    
    showVehicleModal(title, vehicles) {
        if (!vehicles.length) {
            this.showModal(title, '<p style="color: var(--text-primary);">No vehicles found.</p>');
            return;
        }
        
        const html = `
            <div style="margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 15px 0;">
                    <div style="background: var(--status-active-bg); padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 800; color: white;">${vehicles.filter(v => v.workingStatus === 'Active').length}</div>
                        <div style="font-size: 0.85rem; color: white; font-weight: 600;">Active</div>
                    </div>
                    <div style="background: var(--status-offline-bg); padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 800; color: white;">${vehicles.filter(v => v.workingStatus.includes('Offlline')).length}</div>
                        <div style="font-size: 0.85rem; color: white; font-weight: 600;">Offline</div>
                    </div>
                    <div style="background: var(--status-aligned-bg); padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 800; color: white;">${vehicles.filter(v => v.alignmentStatus === 'Alligned').length}</div>
                        <div style="font-size: 0.85rem; color: white; font-weight: 600;">Aligned</div>
                    </div>
                    <div style="background: var(--status-misaligned-bg); padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 800; color: white;">${vehicles.filter(v => v.alignmentStatus === 'Misalligned').length}</div>
                        <div style="font-size: 0.85rem; color: white; font-weight: 600;">Misaligned</div>
                    </div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Vehicle</th><th>Client</th><th>Location</th>
                        <th>Status</th><th>Alignment</th><th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${vehicles.map(vehicle => {
                        const workingStatusClass = vehicle.workingStatus === 'Active' ? 'status-active' : 'status-offline';
                        const alignmentStatusClass = vehicle.alignmentStatus === 'Alligned' ? 'status-aligned' : 'status-misaligned';
                        
                        return `
                            <tr>
                                <td style="color: var(--text-primary); font-weight: 600;">${vehicle.vehicle}</td>
                                <td style="color: var(--text-primary);">${vehicle.client}</td>
                                <td style="color: var(--text-primary);">${vehicle.location}</td>
                                <td><span class="${workingStatusClass}">${vehicle.workingStatus}</span></td>
                                <td><span class="${alignmentStatusClass}">${vehicle.alignmentStatus}</span></td>
                                <td style="color: var(--text-primary);">${vehicle.date}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        
        this.showModal(title, html);
    }
    
    showModal(title, content) {
        document.getElementById('modalTitle').innerHTML = title;
        document.getElementById('modalContent').innerHTML = content;
        document.getElementById('detailModal').style.display = 'block';
    }
    
    closeModal() {
        document.getElementById('detailModal').style.display = 'none';
    }
    
    // =================== EXPORT FUNCTIONS ===================
    
    exportGSClientData(format) {
        const clientData = this.cache.mainData?.gsScriptData?.clientAnalysisTable;
        if (!clientData || !clientData.data) return;
        
        const exportData = clientData.data.map(client => ({
            'S.No': client.sno,
            'Client Name': client.clientName,
            'Vehicle Count': client.vehicleCount,
            'Vehicle Numbers': client.vehicleNumbers,
            'Problem Vehicles': client.problemVehicles,
            'Status': client.status
        }));

        if (format === 'csv') {
            this.exportToCSV(exportData, 'client_analysis.csv');
        } else if (format === 'pdf') {
            this.exportToPDF(exportData, 'client_analysis.pdf');
        }
    }

    exportGSCityData(format) {
        const cityData = this.cache.mainData?.gsScriptData?.cityAnalysisTable;
        if (!cityData || !cityData.data) return;
        
        const exportData = cityData.data.map(city => ({
            'S.No': city.sno,
            'City / Location': city.cityName,
            'Vehicle Count': city.vehicleCount,
            'Vehicle Numbers': city.vehicleNumbers,
            'Problem Vehicles': city.problemVehicles,
            'Status': city.status
        }));

        if (format === 'csv') {
            this.exportToCSV(exportData, 'city_analysis.csv');
        } else if (format === 'pdf') {
            this.exportToPDF(exportData, 'city_analysis.pdf');
        }
    }

    exportToCSV(data, filename) {
        if (!data.length) return;
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => `"${row[header]}"`).join(','))
        ].join('\n');

        this.downloadFile(csvContent, filename, 'text/csv');
    }

    exportToPDF(data, filename) {
        if (!data.length) return;
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.text('Vehicle Data Export', 10, 20);
        
        let y = 40;
        const headers = Object.keys(data[0]);
        
        doc.setFontSize(10);
        headers.forEach((header, index) => {
            doc.text(header, 10 + (index * 25), y);
        });
        
        y += 10;
        
        data.forEach(row => {
            headers.forEach((header, index) => {
                doc.text(String(row[header]).substring(0, 12), 10 + (index * 25), y);
            });
            y += 8;
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
        });
        
        doc.save(filename);
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // =================== UTILITY FUNCTIONS ===================
    
    setupEventListeners() {
        // Close modal on outside click
        window.onclick = (event) => {
            const modal = document.getElementById('detailModal');
            if (event.target === modal) {
                this.closeModal();
            }
        };
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.refreshData();
            }
        });
    }
    
    refreshData() {
        console.log('🔄 Refreshing data...');
        this.cache = {};
        this.startLoading();
    }
    
    toggleTheme() {
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        body.setAttribute('data-theme', newTheme);
        
        const button = document.querySelector('.theme-toggle');
        button.innerHTML = newTheme === 'dark' ? 
            '<i class="fas fa-sun"></i> Light Mode' : 
            '<i class="fas fa-moon"></i> Dark Mode';
        
        // Update charts for new theme
        setTimeout(() => {
            Object.values(this.charts).forEach(chart => {
                if (chart && chart.update) chart.update();
            });
        }, 100);
    }
}

// =================== GLOBAL FUNCTIONS ===================

// Initialize dashboard when page loads
let dashboard;

document.addEventListener('DOMContentLoaded', () => {
    dashboard = new VehicleDashboard();
});

// Global functions for HTML onclick handlers
function saveAPIConfig() {
    dashboard.saveConfig();
}

function showConfig() {
    dashboard.showConfigModal();
}

function refreshData() {
    dashboard.refreshData();
}

function toggleTheme() {
    dashboard.toggleTheme();
}

function switchTab(tabIndex) {
    dashboard.switchTab(tabIndex);
}

function closeModal() {
    dashboard.closeModal();
}

function toggleClientList(filter) {
    dashboard.toggleClientList(filter);
}

function toggleLocationList(filter) {
    dashboard.toggleLocationList(filter);
}

function performDashboardSearch() {
    dashboard.performDashboardSearch();
}

function updateMonthlyAnalysisByMonth() {
    dashboard.updateMonthlyAnalysisByMonth();
}

function exportGSClientData(format) {
    dashboard.exportGSClientData(format);
}

function exportGSCityData(format) {
    dashboard.exportGSCityData(format);
}

console.log('🚀 Complete Vehicle Dashboard JavaScript Loaded - All Original Features Restored!');
