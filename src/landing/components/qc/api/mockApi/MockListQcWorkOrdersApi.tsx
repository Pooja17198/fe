import {makeResponseWithData, withDelay} from "../../../cabling/api/mockAPI/mockServiceHelper";
import { toWorkOrderStatusFilterValue } from "../../workOrderStatus";
import workOrders from "./workOrders";

export class MockListQcWorkOrdersApi {
    public static async listQcWorkOrders(
        lifecycleState?: string,
        createdBy?: string,
        vendorName?: string,
        regionId?: string,
        buildingId?: string,
        dataHallId?: string,
        roomId?: string,
        rackLocationId?: string,
        sortBy?: string
    ): Promise<{ response: Response; data: any }> {
        return withDelay(() => {
            const requestedStatus = toWorkOrderStatusFilterValue(lifecycleState);
            const filteredItems = workOrders.items.filter((workOrder) => {
                const workOrderStatus = toWorkOrderStatusFilterValue(workOrder.lifecycleState);

                return (!requestedStatus || workOrderStatus === requestedStatus)
                    && (!createdBy || workOrder.createdBy === createdBy)
                    && (!vendorName || workOrder.vendorName === vendorName)
                    && (!regionId || workOrder.regionId === regionId)
                    && (!buildingId || workOrder.buildingId === buildingId)
                    && (!dataHallId || workOrder.dataHallId === dataHallId)
                    && (!roomId || workOrder.roomId === roomId)
                    && (!rackLocationId || workOrder.rackLocationId === rackLocationId);
            });

            return makeResponseWithData({
                ...workOrders,
                items: filteredItems
            });
        });
    }
}
