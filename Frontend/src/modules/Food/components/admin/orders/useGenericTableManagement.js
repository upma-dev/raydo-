import { useState, useMemo } from "react"
import { exportToExcel, exportToPDF } from "./ordersExportUtils"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export function useGenericTableManagement(data, title, searchFields = []) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({})
  const [visibleColumns, setVisibleColumns] = useState({})

  // Apply search
  const filteredData = useMemo(() => {
    let result = [...data]

    // Apply search query
    if (searchQuery.trim() && searchFields.length > 0) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(item => 
        searchFields.some(field => {
          const value = item[field]
          return value && value.toString().toLowerCase().includes(query)
        })
      )
    }

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "") {
        result = result.filter(item => {
          const itemValue = item[key]
          if (typeof value === 'string') {
            return itemValue === value || itemValue?.toString().toLowerCase() === value.toLowerCase()
          }
          return itemValue === value
        })
      }
    })

    return result
  }, [data, searchQuery, filters, searchFields])

  const count = filteredData.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => value !== "" && value !== null && value !== undefined).length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({})
  }

  const handleExport = async (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "excel":
        exportToExcel(filteredData, filename)
        break
      case "pdf":
        await exportToPDF(filteredData, filename)
        break
      default:
        break
    }
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOrderOpen(true)
  }

  const handlePrintOrder = async (rawOrder) => {
    try {
      const order = rawOrder?.originalOrder ? { ...rawOrder.originalOrder, ...rawOrder } : (rawOrder || {})
      // Dynamic import of jsPDF and autoTable for instant PDF download
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const orderId = rawOrder.orderId || order.orderId || order.id || order.subscriptionId || 'N/A'
      const customerName = rawOrder.userName || order.customerName || order.userName || order.userId?.name || 'Customer'
      const customerPhone = rawOrder.userNumber || order.customerPhone || order.userNumber || order.userId?.phone || order.deliveryAddress?.phone || 'N/A'
      const restaurantName = rawOrder.restaurantName || order.restaurantName || order.restaurant || order.restaurantId?.restaurantName || 'Restaurant'
      const orderStatus = rawOrder.status || order.orderStatus || order.status || 'N/A'
      const paymentStatus = order.paymentStatus || order.paymentCollectionStatus || 'N/A'

      const items = Array.isArray(order.items) && order.items.length > 0
        ? order.items
        : (Array.isArray(rawOrder.items) ? rawOrder.items : [])

      const totalAmount = Number(order.totalAmount ?? order.total ?? order.pricing?.total ?? rawOrder.totalAmount ?? 0)
      const subtotal = Number(order.subtotal ?? order.pricing?.subtotal ?? order.totalItemAmount ?? totalAmount)
      const deliveryFee = Number(order.deliveryFee ?? order.deliveryCharge ?? order.pricing?.deliveryFee ?? 0)
      const tax = Number(order.tax ?? order.vatTax ?? order.taxAmount ?? order.pricing?.tax ?? 0)
      const discount = Number(order.discountAmount ?? order.couponDiscount ?? order.itemDiscount ?? order.pricing?.discount ?? 0)

      // Add Header Bar
      doc.setFillColor(15, 118, 110)
      doc.rect(0, 0, pageWidth, 40, 'F')
      
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18)
      doc.setFont(undefined, 'bold')
      doc.text('Raydo Food Order Invoice', 14, 18)
      doc.setFontSize(9)
      doc.setFont(undefined, 'normal')
      doc.text('Admin Order Summary & Receipt', 14, 26)

      doc.setFontSize(9)
      doc.text(`Order ID: #${orderId}`, pageWidth - 14, 16, { align: 'right' })
      const orderDateStr = rawOrder.orderDate 
        ? `${rawOrder.orderDate} ${rawOrder.orderTime || ''}` 
        : (order.date && order.time ? `${order.date}, ${order.time}` : (order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleDateString()))
      doc.text(`Date: ${orderDateStr}`, pageWidth - 14, 22, { align: 'right' })
      doc.text(`Status: ${orderStatus}`, pageWidth - 14, 28, { align: 'right' })

      let startY = 48
      
      // Customer & Restaurant Info Box
      doc.setDrawColor(226, 232, 240)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(14, startY, pageWidth - 28, 30, 3, 3, 'FD')
      
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text('Customer Details', 18, startY + 8)
      doc.text('Restaurant Details', (pageWidth / 2) + 4, startY + 8)

      doc.setFontSize(9)
      doc.setFont(undefined, 'normal')
      doc.setTextColor(71, 85, 105)
      doc.text(`Name: ${customerName}`, 18, startY + 15)
      doc.text(`Phone: ${customerPhone}`, 18, startY + 22)

      doc.text(`Name: ${restaurantName}`, (pageWidth / 2) + 4, startY + 15)
      const deliveryAddress = order.deliveryAddress?.formattedAddress || order.address || order.customerAddress
      if (deliveryAddress) {
        const addr = String(deliveryAddress).slice(0, 45)
        doc.text(`Delivery: ${addr}`, (pageWidth / 2) + 4, startY + 22)
      }

      startY += 38
      
      // Order Items Table
      const tableData = items.length > 0 
        ? items.map((item) => {
            const qty = Number(item.quantity || 1)
            const name = item.name || item.itemName || item.title || 'Food Item'
            const price = Number(item.price || 0)
            const lineTotal = qty * price
            return [qty, name, `INR ${price.toFixed(2)}`, `INR ${lineTotal.toFixed(2)}`]
          })
        : [[1, 'Order Summary Total', `INR ${totalAmount.toFixed(2)}`, `INR ${totalAmount.toFixed(2)}`]]
        
      autoTable(doc, {
        startY: startY,
        head: [['Qty', 'Item Name', 'Unit Price', 'Total']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [15, 118, 110],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [30, 41, 59]
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        styles: {
          cellPadding: 4,
          lineColor: [226, 232, 240],
          lineWidth: 0.3
        },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 90 },
          2: { cellWidth: 36, halign: 'right' },
          3: { cellWidth: 36, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
      })
      
      const finalY = (doc.lastAutoTable?.finalY || startY + 40) + 8
      
      // Totals Box
      doc.setDrawColor(226, 232, 240)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(pageWidth - 85, finalY, 71, 32, 2, 2, 'FD')
      
      doc.setFontSize(9)
      doc.setFont(undefined, 'normal')
      doc.setTextColor(71, 85, 105)
      doc.text('Subtotal:', pageWidth - 80, finalY + 7)
      doc.text(`INR ${subtotal.toFixed(2)}`, pageWidth - 18, finalY + 7, { align: 'right' })
      
      doc.text('Delivery Fee:', pageWidth - 80, finalY + 13)
      doc.text(`INR ${deliveryFee.toFixed(2)}`, pageWidth - 18, finalY + 13, { align: 'right' })
      
      if (tax > 0) {
        doc.text('Tax:', pageWidth - 80, finalY + 19)
        doc.text(`INR ${tax.toFixed(2)}`, pageWidth - 18, finalY + 19, { align: 'right' })
      }
      
      doc.setFont(undefined, 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 118, 110)
      doc.text('Total Amount:', pageWidth - 80, finalY + 26)
      doc.text(`INR ${totalAmount.toFixed(2)}`, pageWidth - 18, finalY + 26, { align: 'right' })

      // Save PDF
      const filename = `Invoice_${orderId}_${new Date().toISOString().split("T")[0]}.pdf`
      doc.save(filename)
    } catch (error) {
      console.error("Error generating PDF invoice:", error)
      alert("Failed to download PDF invoice. Please try again.")
    }
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  const resetColumns = (defaultColumns) => {
    setVisibleColumns(defaultColumns || {})
  }

  return {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    visibleColumns,
    filteredData,
    count,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}

