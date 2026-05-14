import { Dispatch, StateUpdater, useMemo } from "preact/hooks";
import { AdrBuilding, DataCenterRoom } from "../types";
import { useRoomMetadata } from "../api/hooks/materialApi";
import "oj-c/select-single";
import ArrayDataProvider from "ojs/ojarraydataprovider";
import { UseMockData } from "./GraphView";

interface RegionADSiteSelectorsProps {
  rooms?: DataCenterRoom[];
  loading?: boolean;
  selectedRoom: string | undefined;
  setSelectedRoom: Dispatch<StateUpdater<DataCenterRoom | null>>;
  onLocationSelectorsChange?: () => void;
}

type RoomOption = {
  label: string;
  value: string;
  room: DataCenterRoom;
};

const RegionADSiteSelectors = ({
  rooms,
  loading,
  selectedRoom,
  setSelectedRoom,
  onLocationSelectorsChange,
}: RegionADSiteSelectorsProps) => {
  const { data: adrBuildingData, isFetching: adsLoading } =
    useRoomMetadata(UseMockData);

  const roomOptions = useMemo<RoomOption[]>(() => {
    const roomMap = new Map<string, DataCenterRoom>();

    (rooms || []).forEach((room) => {
      if (!room?.roomName) return;
      if (!roomMap.has(room.roomName)) {
        roomMap.set(room.roomName, room);
      }
    });

    if (roomMap.size === 0) {
      (adrBuildingData || []).forEach((item: AdrBuilding) => {
        const roomName = item.roomCanonicalName;
        if (!roomName || roomMap.has(roomName)) {
          return;
        }

        roomMap.set(roomName, {
          roomName,
          availabilityDomain: item.availabilityDomainCanonicalShortCode,
          region: item.regionDisplayName,
          building: item.buildingCanonicalName,
        });
      });
    }

    return Array.from(roomMap.values())
      .map((room) => ({
        value: room.roomName,
        label: `${room.region || "-"},  ${room.availabilityDomain || "-"},  ${room.roomName.toLocaleUpperCase()}`,
        room,
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [rooms, adrBuildingData]);

  const roomInfo = useMemo(
    () => new ArrayDataProvider(roomOptions, { keyAttributes: "value" }),
    [roomOptions],
  );

  const handleRoomChange = (value?: string | null) => {
    if (!value) {
      onLocationSelectorsChange?.();
      setSelectedRoom(null);
      return;
    }
    if (value === selectedRoom) {
      return;
    }

    const nextRoom = roomOptions.find((option) => option.value === value)?.room;
    if (!nextRoom) {
      return;
    }

    onLocationSelectorsChange?.();
    setSelectedRoom(nextRoom);
  };

  const roomItemText = (itemContext: any) => {
    const option = itemContext?.data as RoomOption | undefined;
    if (!option) {
      return "";
    }
    return option.value === selectedRoom ? option.room.roomName.toLocaleUpperCase() : option.label;
  };

  return (
    <div className="region-dropdown-group">
      <oj-c-select-single
        id="selectedRoom"
        data={roomInfo}
        itemText={roomItemText}
        width={"sm"}
        labelHint="Region, AD, Room"
        placeholder={
          loading || adsLoading
            ? "Loading..."
            : "Choose a room..."
        }
        onvalueChanged={(event) => handleRoomChange(event.detail.value)}
        value={selectedRoom}
        disabled={loading || adsLoading || roomOptions.length === 0}
      />
    </div>
  );
};

export default RegionADSiteSelectors;
